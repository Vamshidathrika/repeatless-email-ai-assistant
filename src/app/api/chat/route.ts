import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { askAgentAboutEmails } from "@/lib/gemini";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const { query, history } = await req.json();

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    // 1. Retrieve User Preferences for model settings
    const preference = await db.userPreference.findUnique({
      where: { userId }
    });
    const chatModel = preference?.chatModel || "gemini-2.5-flash-lite";

    // 2. Map query keywords to target categories for intent classification
    const categoryMappers: Record<string, string> = {
      newsletter: "Newsletters",
      digest: "Newsletters",
      subscription: "Newsletters",
      job: "Job / Recruitment",
      interview: "Job / Recruitment",
      application: "Job / Recruitment",
      reject: "Job / Recruitment",
      offer: "Job / Recruitment",
      invoice: "Finance",
      receipt: "Finance",
      payment: "Finance",
      bank: "Finance",
      alert: "Notifications",
      otp: "Notifications",
      code: "Notifications",
      personal: "Personal",
      friend: "Personal",
      work: "Work / Professional",
      project: "Work / Professional",
      team: "Work / Professional",
      meeting: "Work / Professional"
    };

    let targetCategory = "";
    const lowerQuery = query.toLowerCase();
    for (const [key, cat] of Object.entries(categoryMappers)) {
      if (lowerQuery.includes(key)) {
        targetCategory = cat;
        break;
      }
    }

    const isNewsletterQuery =
      lowerQuery.includes("newsletter") ||
      lowerQuery.includes("news digest") ||
      lowerQuery.includes("news updates") ||
      lowerQuery.includes("digest of news") ||
      (lowerQuery.includes("news") && (lowerQuery.includes("update") || lowerQuery.includes("recent") || lowerQuery.includes("brief") || lowerQuery.includes("summary")));

    if (isNewsletterQuery) {
      targetCategory = "Newsletters";
    }

    // 3. Search and Retrieve Relevant context
    // A. Fetch recent emails (most recent 25)
    const recentEmails = await db.email.findMany({
      where: { userId, isDuplicate: false },
      include: { summary: true },
      orderBy: { date: "desc" },
      take: 25,
    });

    // B. Keyword matching search
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w: string) => w.length > 3 && !["what", "show", "from", "with", "have", "about", "your", "mail", "email"].includes(w));

    let searchEmails: any[] = [];
    if (keywords.length > 0) {
      const searchConditions = keywords.map((word: string) => ({
        OR: [
          { subject: { contains: word, mode: "insensitive" } },
          { sender: { contains: word, mode: "insensitive" } },
          { bodyContent: { contains: word, mode: "insensitive" } },
        ],
      }));

      searchEmails = await db.email.findMany({
        where: {
          userId,
          isDuplicate: false,
          OR: searchConditions,
        },
        include: { summary: true },
        orderBy: { date: "desc" },
        take: 15,
      });
    }

    // C. Category specific recent emails retrieval (to ensure cross-email category synthesis)
    let categoryEmails: any[] = [];
    if (targetCategory) {
      categoryEmails = await db.email.findMany({
        where: {
          userId,
          isDuplicate: false,
          summary: {
            category: targetCategory
          }
        },
        include: { summary: true },
        orderBy: { date: "desc" },
        take: targetCategory === "Newsletters" ? 25 : 15
      });
    }

    // Deduplicate matching emails by their primary Email ID
    const emailMap = new Map<string, any>();
    recentEmails.forEach((e: any) => emailMap.set(e.id, e));
    searchEmails.forEach((e: any) => emailMap.set(e.id, e));
    categoryEmails.forEach((e: any) => emailMap.set(e.id, e));

    const matchedEmailsList = Array.from(emailMap.values());

    // 4. Thread-First Concept: Fetch all historical thread messages chronologically
    const threadIds = Array.from(new Set(matchedEmailsList.map((e: any) => e.threadId).filter(Boolean)));
    const threadEmails = await db.email.findMany({
      where: {
        userId,
        threadId: { in: threadIds as string[] },
      },
      include: { summary: true },
      orderBy: { date: "asc" }, // chronological order inside each thread
    });

    // Group emails by threadId
    const threadsMap = new Map<string, any[]>();
    threadEmails.forEach((email: any) => {
      if (!threadsMap.has(email.threadId)) {
        threadsMap.set(email.threadId, []);
      }
      threadsMap.get(email.threadId)!.push(email);
    });

    // 5. Construct Structured Prompt Context Grouped by Thread
    const contextLines = Array.from(threadsMap.entries()).map(([threadId, emailsInThread]) => {
      const messagesText = emailsInThread.map((e, index) => {
        const summaryText = e.summary 
          ? `Summary: ${e.summary.shortSummary}\nCategory: ${e.summary.category}\nImportance Score: ${e.summary.importanceScore}/10\nAction Items: ${e.summary.actionItems}`
          : `Snippet: ${e.bodySnippet}`;
        
        const labelsList = e.labels ? e.labels.split(",") : [];
        const isUnread = labelsList.includes("UNREAD");
        
        return `  Message #${index + 1} [ID: ${e.id}]:
  From: ${e.sender}
  Date: ${e.date.toISOString()}
  Status: ${isUnread ? "Unread" : "Read"}
  Subject: ${e.subject}
  ${summaryText}
  Content: ${e.bodyContent.slice(0, 1000)}`;
      }).join("\n\n");

      return `Thread ID: ${threadId}
Total Messages in Thread: ${emailsInThread.length}
Messages:
${messagesText}
---`;
    });

    const emailContext = contextLines.join("\n\n");

    // 6. Generate Answer using Gemini Chat Agent with conversational history
    const reply = await askAgentAboutEmails(query, emailContext, history || [], chatModel, isNewsletterQuery);

    return NextResponse.json({
      success: true,
      answer: reply,
    });
  } catch (error: any) {
    console.error("Chat API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process chat query" },
      { status: 500 }
    );
  }
}
