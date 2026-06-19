import { google, gmail_v1 } from "googleapis";
import { db } from "./db";
import { summarizeThreadEmail } from "./gemini";
import crypto from "crypto";

// Dynamically resolve NEXTAUTH_URL on Vercel deployments to prevent redirect URI mismatch
if (process.env.VERCEL_URL && (!process.env.NEXTAUTH_URL || process.env.NEXTAUTH_URL.includes("localhost"))) {
  process.env.NEXTAUTH_URL = `https://${process.env.VERCEL_URL}`;
}

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/auth/callback/google`
);

export async function getGmailClient(userId: string) {
  const account = await db.account.findFirst({
    where: { userId, provider: "google" },
  });

  if (!account || !account.access_token) {
    throw new Error(`No Google account credentials found for user: ${userId}`);
  }

  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  // Automatically save refreshed tokens
  oauth2Client.on("tokens", async (tokens) => {
    const updateData: { access_token?: string | null; expires_at?: number | null; refresh_token?: string | null } = {};
    if (tokens.access_token) updateData.access_token = tokens.access_token;
    if (tokens.expiry_date) updateData.expires_at = Math.floor(tokens.expiry_date / 1000);
    if (tokens.refresh_token) updateData.refresh_token = tokens.refresh_token;

    try {
      await db.account.update({
        where: { id: account.id },
        data: updateData,
      });
      console.log(`Refreshed and stored Google OAuth tokens for user: ${userId}`);
    } catch (err) {
      console.error("Failed to update refreshed tokens in database:", err);
    }
  });

  return google.gmail({ version: "v1", auth: oauth2Client });
}

// Helper to escape HTML characters
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Helper to parse List-Unsubscribe header to extract HTTP URLs or mailtos
function parseUnsubscribeUrl(headerValue: string): string | null {
  if (!headerValue) return null;
  // Match URLs inside angle brackets
  const matches = headerValue.match(/<([^>]+)>/g);
  if (matches) {
    for (const match of matches) {
      const url = match.slice(1, -1);
      if (url.startsWith("http")) {
        return url;
      }
    }
    // Fallback to first match (e.g. mailto)
    return matches[0].slice(1, -1);
  }
  return null;
}

// Extract both text and html email body from MIME structure
function extractBodyParts(payload: gmail_v1.Schema$MessagePart | undefined | null): { text: string; html: string } {
  let text = "";
  let html = "";

  function traverse(part: gmail_v1.Schema$MessagePart | undefined | null) {
    if (!part) return;

    if (part.body && part.body.data) {
      const decoded = Buffer.from(part.body.data, "base64").toString("utf-8");
      if (part.mimeType === "text/plain") {
        text += decoded;
      } else if (part.mimeType === "text/html") {
        html += decoded;
      }
    }

    if (part.parts && Array.isArray(part.parts)) {
      part.parts.forEach(traverse);
    }
  }

  traverse(payload);

  // Fallbacks:
  // If we only got html but no text, generate text by stripping tags
  if (html && !text) {
    text = html
      .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, "")
      .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  // If we only got text but no html, generate html by formatting text
  if (text && !html) {
    html = `<html><body style="font-family: sans-serif; white-space: pre-wrap; padding: 20px; color: #1A1410;">${escapeHtml(text)}</body></html>`;
  }

  return { text, html };
}

// Deduplication Signature Helpers
function normalizeSender(sender: string): string {
  const emailRegex = /<([^>]+)>/;
  const match = sender.match(emailRegex);
  const email = match && match[1] ? match[1] : sender;
  return email.toLowerCase().trim();
}

function normalizeSubject(subject: string): string {
  return subject
    .toLowerCase()
    .replace(/\b(re|fwd|fw|reply):\s*/gi, "") // strip prefixes
    .replace(/[^a-zA-Z\s]/g, "") // strip numbers & special characters
    .replace(/\s+/g, " ") // normalize spacing
    .trim();
}

function getYearWeekString(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, "0")}`;
}

export function generateDedupHash(sender: string, subject: string, date: Date): string {
  const normSender = normalizeSender(sender);
  const normSubject = normalizeSubject(subject);
  const weekString = getYearWeekString(date);

  const signature = `${normSender}|${normSubject}|${weekString}`;
  return crypto.createHash("md5").update(signature).digest("hex");
}

export async function syncEmails(userId: string, limit: number = 20) {
  const gmail = await getGmailClient(userId);
  
  // Ensure user preference exists
  let preference = await db.userPreference.findUnique({
    where: { userId }
  });
  if (!preference) {
    preference = await db.userPreference.create({
      data: { userId }
    });
  }

  console.log(`Starting thread-first email sync for user ${userId}...`);

  // Fetch list of recent threads (each thread can contain multiple messages)
  const response = await gmail.users.threads.list({
    userId: "me",
    maxResults: limit,
    q: "-category:chats", // avoid chat histories
  });

  const threadsList = response.data.threads || [];
  let newEmailsCount = 0;
  let skippedDuplicates = 0;
  let processedMessagesCount = 0;

  for (const threadItem of threadsList) {
    if (!threadItem.id) continue;

    try {
      // Fetch full thread with all its historical messages
      const threadData = await gmail.users.threads.get({
        userId: "me",
        id: threadItem.id,
        format: "full"
      });

      const messages = threadData.data.messages || [];
      let threadContextText = "";

      for (const msg of messages) {
        if (!msg.id) continue;
        processedMessagesCount++;

        const headers = msg.payload?.headers || [];
        const subject = headers.find((h) => h.name?.toLowerCase() === "subject")?.value || "(No Subject)";
        const sender = headers.find((h) => h.name?.toLowerCase() === "from")?.value || "Unknown";
        const receiver = headers.find((h) => h.name?.toLowerCase() === "to")?.value || "";
        const dateStr = headers.find((h) => h.name?.toLowerCase() === "date")?.value || "";
        const date = dateStr ? new Date(dateStr) : new Date();
        const snippet = msg.snippet || "";

        const parsedBodies = extractBodyParts(msg.payload);
        const bodyContent = parsedBodies.text || snippet;
        const htmlContent = parsedBodies.html || null;

        const unsubHeader = headers.find((h) => h.name?.toLowerCase() === "list-unsubscribe")?.value || "";
        const unsubscribeUrl = parseUnsubscribeUrl(unsubHeader);

        // Build rolling thread context to give to summarizer
        threadContextText += `From: ${sender}\nDate: ${date.toISOString()}\nSubject: ${subject}\nContent:\n${bodyContent.slice(0, 3000)}\n---\n`;

        // Check if message already exists in database
        const existingEmail = await db.email.findUnique({
          where: { id: msg.id }
        });

        if (existingEmail) {
          continue; // Already processed
        }

        // Deduplication Check: ONLY for single-message threads (e.g. newsletters/promotions)
        // Multi-message threads = active conversations — NEVER deduplicate replies in those
        const dedupHash = generateDedupHash(sender, subject, date);
        let isDuplicate = false;

        if (messages.length === 1) {
          // Single-message thread: safe to dedup (newsletters, promo blasts, etc.)
          const duplicateEmail = await db.email.findFirst({
            where: {
              userId,
              dedupHash,
              isDuplicate: false,
            },
          });
          if (duplicateEmail) {
            isDuplicate = true;
            skippedDuplicates++;
          }
        }

        // Save Email entry
        const email = await db.email.create({
          data: {
            id: msg.id,
            threadId: threadItem.id,
            userId,
            subject,
            sender,
            receiver,
            date,
            bodySnippet: snippet,
            bodyContent,
            htmlContent,
            unsubscribeUrl,
            labels: msg.labelIds?.join(",") || "",
            isDuplicate,
            dedupHash,
          },
        });

        // 4. Summarization step (only if not a duplicate)
        if (!isDuplicate) {
          try {
            // Pass the rolling threadContextText to summarizeThreadEmail
            const summary = await summarizeThreadEmail(
              subject,
              sender,
              bodyContent,
              threadContextText,
              preference.summaryModel
            );

            await db.emailSummary.create({
              data: {
                emailId: email.id,
                shortSummary: summary.shortSummary,
                detailedSummary: summary.detailedSummary,
                actionItems: JSON.stringify(summary.actionItems),
                category: summary.category,
                importanceScore: summary.importanceScore,
                replySuggestions: JSON.stringify(summary.replySuggestions),
              },
            });
            newEmailsCount++;
          } catch (summarizeError) {
            console.error(`Failed to summarize email ${email.id} during sync:`, summarizeError);
            // Create a default placeholder summary so that sync continues and completes successfully
            await db.emailSummary.create({
              data: {
                emailId: email.id,
                shortSummary: "Failed to summarize email.",
                detailedSummary: "The AI model encountered an error while processing this message.",
                actionItems: JSON.stringify([]),
                category: "Updates",
                importanceScore: 1,
                replySuggestions: JSON.stringify([]),
              },
            });
            newEmailsCount++;
          }
        } else {
          // Create dummy summary for duplicate
          await db.emailSummary.create({
            data: {
              emailId: email.id,
              shortSummary: `[Duplicate Newsletter] Similar newsletter sent this week.`,
              detailedSummary: `This newsletter was flagged as a duplicate of an earlier one from ${sender}. Summarization skipped.`,
              actionItems: JSON.stringify([]),
              category: "Newsletters",
              importanceScore: 1,
              replySuggestions: JSON.stringify([]),
            },
          });
        }
      }
    } catch (threadErr) {
      console.error(`Failed to process thread ${threadItem.id}:`, threadErr);
    }
  }

  // Update Sync State
  await db.syncState.upsert({
    where: { userId },
    update: { lastSyncAt: new Date() },
    create: { userId, lastSyncAt: new Date() },
  });

  return {
    processed: processedMessagesCount,
    newEmails: newEmailsCount,
    duplicatesSkipped: skippedDuplicates,
  };
}
export async function sendGmailReply(
  userId: string,
  threadId: string | null,
  replyText: string,
  recipient: string,
  subject: string,
  cc?: string | null,
  bcc?: string | null
) {
  const gmail = await getGmailClient(userId);

  // Fetch ALL thread message IDs to build a proper References chain per RFC 2822
  // Skip when threadId is null (forward mode — creates a brand-new thread)
  let parentMessageId = "";
  const allMessageIds: string[] = [];
  if (threadId) {
    try {
      const threadRes = await gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format: "metadata",
        metadataHeaders: ["Message-ID"],
      });

      const messages = threadRes.data.messages || [];
      for (const msg of messages) {
        const headers = msg.payload?.headers || [];
        const msgId = headers.find((h: gmail_v1.Schema$MessagePartHeader) => h.name?.toLowerCase() === "message-id")?.value || "";
        if (msgId) allMessageIds.push(msgId);
      }
      if (allMessageIds.length > 0) {
        parentMessageId = allMessageIds[allMessageIds.length - 1];
      }
    } catch (err) {
      console.error("Failed to fetch thread Message-IDs for threading:", err);
    }
  }

  // Draft MIME message with proper threading headers
  const mimeHeaders = [
    `To: ${recipient}`,
    `Subject: ${subject.startsWith("Re:") || subject.startsWith("Fwd:") ? subject : "Re: " + subject}`,
  ];

  if (cc) mimeHeaders.push(`Cc: ${cc}`);
  if (bcc) mimeHeaders.push(`Bcc: ${bcc}`);

  if (parentMessageId && threadId) {
    mimeHeaders.push(`In-Reply-To: ${parentMessageId}`);
    // References should include all message IDs in the thread chain (RFC 2822)
    mimeHeaders.push(`References: ${allMessageIds.join(" ")}`);
  }

  mimeHeaders.push("Content-Type: text/plain; charset=utf-8");
  mimeHeaders.push("");
  mimeHeaders.push(replyText);

  const rawMessage = mimeHeaders.join("\n");

  const encodedMessage = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  // Only set threadId in the request if we have one (omitting it creates a new thread for forwards)
  const requestBody: gmail_v1.Schema$Message = { raw: encodedMessage };
  if (threadId) requestBody.threadId = threadId;

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody,
  });

  return res.data;
}
