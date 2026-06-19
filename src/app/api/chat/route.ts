import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { askAgentAboutEmails } from "@/lib/gemini";
import crypto from "crypto";

// ─── Rate Limit Config ────────────────────────────────────────────────────────
const RATE_LIMIT_WINDOW_MS = 60_000; // 60 seconds
const RATE_LIMIT_MAX_REQUESTS = 10; // max 10 queries per window

// ─── Cache Config ─────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── Token Efficiency Config ──────────────────────────────────────────────────
const MAX_EMAILS_IN_CONTEXT = 20;       // cap total emails sent to LLM
const MAX_BODY_CHARS = 400;             // max chars from raw email body
const MAX_CONTEXT_CHARS = 12_000;       // hard cap on total context string length

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalize a query for deterministic hashing: lowercase, strip punctuation, sort words */
function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

/** SHA-256 hash of the normalized query string */
function hashQuery(normalized: string): string {
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/** Check per-user sliding window rate limit. Returns true if allowed, false if blocked. */
async function checkRateLimit(userId: string): Promise<{ allowed: boolean; remaining: number }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);

  const existing = await db.rateLimit.findUnique({ where: { userId } });

  if (!existing || existing.windowStart < windowStart) {
    // New window — reset counter
    await db.rateLimit.upsert({
      where: { userId },
      create: { userId, windowStart: now, requestCount: 1 },
      update: { windowStart: now, requestCount: 1 },
    });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
  }

  if (existing.requestCount >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  await db.rateLimit.update({
    where: { userId },
    data: { requestCount: { increment: 1 } },
  });

  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - existing.requestCount - 1 };
}

/** Try to serve from RAG cache. Returns cached answer string or null. */
async function getFromCache(userId: string, queryHash: string, lastSyncAt: Date | null): Promise<string | null> {
  const cached = await db.queryCache.findUnique({
    where: { userId_queryHash: { userId, queryHash } },
  });

  if (!cached) return null;

  // Expired TTL
  if (cached.expiresAt < new Date()) {
    await db.queryCache.delete({ where: { id: cached.id } });
    return null;
  }

  // Cache stale if new emails were synced after the cache was created
  if (lastSyncAt && lastSyncAt > cached.createdAt) {
    await db.queryCache.delete({ where: { id: cached.id } });
    return null;
  }

  // Cache hit — increment counter and return
  await db.queryCache.update({
    where: { id: cached.id },
    data: { hitCount: { increment: 1 } },
  });

  return cached.answer;
}

/** Store a new answer in the RAG cache with TTL. */
async function storeInCache(userId: string, queryHash: string, queryText: string, answer: string): Promise<void> {
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
  await db.queryCache.upsert({
    where: { userId_queryHash: { userId, queryHash } },
    create: { userId, queryHash, queryText, answer, expiresAt, hitCount: 0 },
    update: { answer, expiresAt, hitCount: 0, queryText },
  });
}

// ─── Main Handler ──────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as { id?: string }).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const body = await req.json();
    const query: string = body.query || "";
    const history: { role: "user" | "assistant"; content: string }[] = body.history || [];

    if (!query.trim()) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    // ── 1. Rate Limiting ──────────────────────────────────────────────────────
    const { allowed, remaining } = await checkRateLimit(userId);
    if (!allowed) {
      return NextResponse.json(
        {
          success: true,
          answer: "⚠️ You've sent too many queries in the last minute. Please wait a moment before asking again.",
          cached: false,
          rateLimited: true,
        },
        { status: 200 } // Return 200 so the UI shows it as a message, not an error
      );
    }

    // ── 2. RAG Cache Lookup ───────────────────────────────────────────────────
    const normalized = normalizeQuery(query);
    const queryHash = hashQuery(normalized);

    // Get last sync timestamp to detect stale cache
    const syncState = await db.syncState.findUnique({ where: { userId } });
    const lastSyncAt = syncState?.lastSyncAt || null;

    // Only use cache for non-conversational queries (no history = fresh question)
    const isFollowUp = history.length > 1;
    if (!isFollowUp) {
      const cached = await getFromCache(userId, queryHash, lastSyncAt);
      if (cached) {
        return NextResponse.json({
          success: true,
          answer: cached,
          cached: true,
          remaining,
        });
      }
    }

    // ── 3. User Preferences ───────────────────────────────────────────────────
    const preference = await db.userPreference.findUnique({ where: { userId } });
    const chatModel = preference?.chatModel || "llama-3.1-8b-instant";

    // ── 4. Intent Classification (category routing) ───────────────────────────
    const categoryMappers: Record<string, string> = {
      newsletter: "Newsletters", digest: "Newsletters", subscription: "Newsletters",
      job: "Job / Recruitment", interview: "Job / Recruitment", application: "Job / Recruitment",
      offer: "Job / Recruitment", hiring: "Job / Recruitment", resume: "Job / Recruitment",
      invoice: "Finance", receipt: "Finance", payment: "Finance", bank: "Finance", billing: "Finance",
      alert: "Notifications", otp: "Notifications", verification: "Notifications",
      personal: "Personal", friend: "Personal",
      work: "Work / Professional", project: "Work / Professional", team: "Work / Professional", meeting: "Work / Professional",
    };

    const lowerQuery = query.toLowerCase();
    let targetCategory = "";
    for (const [key, cat] of Object.entries(categoryMappers)) {
      if (lowerQuery.includes(key)) { targetCategory = cat; break; }
    }

    const isNewsletterQuery =
      lowerQuery.includes("newsletter") ||
      lowerQuery.includes("news digest") ||
      (lowerQuery.includes("news") && (lowerQuery.includes("update") || lowerQuery.includes("brief") || lowerQuery.includes("summary")));

    if (isNewsletterQuery) targetCategory = "Newsletters";

    // ── 5. Smart Context Retrieval (Token-Efficient) ──────────────────────────
    // Extract meaningful keywords (skip stop words)
    const stopWords = new Set(["what", "show", "from", "with", "have", "about", "your", "mail", "email", "the", "and", "for", "that", "this", "are", "can", "you", "tell", "give", "me"]);
    const keywords = lowerQuery.split(/\s+/).filter((w) => w.length > 3 && !stopWords.has(w));

    // Fetch in parallel for speed
    const [recentEmails, searchEmails, categoryEmails] = await Promise.all([
      // A. Recent emails (capped at 10 — use summaries where possible)
      db.email.findMany({
        where: { userId, isDuplicate: false },
        include: { summary: true },
        orderBy: { date: "desc" },
        take: 10,
      }),

      // B. Keyword search (capped at 8)
      keywords.length > 0
        ? db.email.findMany({
            where: {
              userId, isDuplicate: false,
              OR: keywords.slice(0, 3).map((w) => ({
                OR: [
                  { subject: { contains: w, mode: "insensitive" } },
                  { sender: { contains: w, mode: "insensitive" } },
                ],
              })),
            },
            include: { summary: true },
            orderBy: { date: "desc" },
            take: 8,
          })
        : Promise.resolve([]),

      // C. Category emails (capped at 8)
      targetCategory
        ? db.email.findMany({
            where: { userId, isDuplicate: false, summary: { category: targetCategory } },
            include: { summary: true },
            orderBy: { date: "desc" },
            take: 8,
          })
        : Promise.resolve([]),
    ]);

    // Deduplicate by email ID and enforce MAX_EMAILS_IN_CONTEXT
    const emailMap = new Map<string, typeof recentEmails[0]>();
    [...recentEmails, ...searchEmails, ...categoryEmails].forEach((e) => emailMap.set(e.id, e));
    const allEmails = Array.from(emailMap.values()).slice(0, MAX_EMAILS_IN_CONTEXT);

    // ── 6. Build Compact Context (prefer AI summaries over raw body) ──────────
    const contextLines = allEmails.map((e) => {
      const isUnread = e.labels?.toUpperCase().includes("UNREAD");
      const dateStr = new Date(e.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

      // Use pre-computed AI summary when available — far fewer tokens
      if (e.summary) {
        const actions = (() => {
          try { return JSON.parse(e.summary.actionItems || "[]").slice(0, 2).join("; ") || "None"; }
          catch { return "None"; }
        })();
        return `[${dateStr}] ${isUnread ? "UNREAD " : ""}From: ${e.sender} | Subject: ${e.subject}
  Category: ${e.summary.category} | Importance: ${e.summary.importanceScore}/10
  Summary: ${e.summary.shortSummary}
  Actions: ${actions}`;
      }

      // Fallback to snippet (capped)
      const body = (e.bodyContent || e.bodySnippet || "").slice(0, MAX_BODY_CHARS);
      return `[${dateStr}] ${isUnread ? "UNREAD " : ""}From: ${e.sender} | Subject: ${e.subject}
  Content: ${body}`;
    });

    // Hard cap on total context size
    let emailContext = contextLines.join("\n\n---\n\n");
    if (emailContext.length > MAX_CONTEXT_CHARS) {
      emailContext = emailContext.slice(0, MAX_CONTEXT_CHARS) + "\n\n[Context truncated to save tokens]";
    }

    // ── 7. Trim history to last 4 exchanges (saves tokens on follow-ups) ──────
    const trimmedHistory = history.slice(-8); // last 4 Q&A pairs

    // ── 8. Call LLM ───────────────────────────────────────────────────────────
    const answer = await askAgentAboutEmails(
      query,
      emailContext,
      trimmedHistory,
      chatModel,
      isNewsletterQuery
    );

    // ── 9. Store in RAG Cache (only for non-follow-up queries) ────────────────
    if (!isFollowUp && answer && !answer.startsWith("Error:")) {
      await storeInCache(userId, queryHash, query, answer);
    }

    return NextResponse.json({ success: true, answer, cached: false, remaining });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Chat API Error:", msg);
    return NextResponse.json({ error: msg || "Failed to process chat query" }, { status: 500 });
  }
}
