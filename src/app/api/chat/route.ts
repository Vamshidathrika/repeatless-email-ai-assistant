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
    const { query } = await req.json();

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    // 1. Retrieve User Preferences for model settings
    let preference = await db.userPreference.findUnique({
      where: { userId }
    });
    const chatModel = preference?.chatModel || "gemini-1.5-flash";

    // 2. Simple Keyword / Semantic Context Retrieval
    // Fetch the 20 most recent emails
    const recentEmails = await db.email.findMany({
      where: { userId, isDuplicate: false },
      include: { summary: true },
      orderBy: { date: "desc" },
      take: 20,
    });

    // Also try to find specifically matching emails based on keywords in query
    // Simple word extraction: split query by space and filter out short words
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w: string) => w.length > 3 && !["what", "show", "from", "with", "have", "about"].includes(w));

    let searchEmails: any[] = [];
    if (keywords.length > 0) {
      const searchConditions = keywords.map((word: string) => ({
        OR: [
          { subject: { contains: word } },
          { sender: { contains: word } },
          { bodyContent: { contains: word } },
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
        take: 10,
      });
    }

    // Combine and deduplicate by Email ID
    const emailMap = new Map<string, any>();
    recentEmails.forEach((e: any) => emailMap.set(e.id, e));
    searchEmails.forEach((e: any) => emailMap.set(e.id, e));
    const combinedEmails = Array.from(emailMap.values())
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 25); // Limit context size

    // 3. Construct text context for LLM prompt
    const contextLines = combinedEmails.map((e) => {
      const summaryText = e.summary 
        ? `Summary: ${e.summary.shortSummary}\nCategory: ${e.summary.category}\nImportance Score: ${e.summary.importanceScore}/10\nAction Items: ${e.summary.actionItems}`
        : `Snippet: ${e.bodySnippet}`;
      
      const labelsList = e.labels ? e.labels.split(",") : [];
      const isUnread = labelsList.includes("UNREAD");
      const isStarred = labelsList.includes("STARRED");
      
      return `[Email ID: ${e.id} | Thread ID: ${e.threadId}]
From: ${e.sender}
Date: ${e.date.toISOString()}
Status: ${isUnread ? "Unread" : "Read"}${isStarred ? " (Starred)" : ""}
Subject: ${e.subject}
${summaryText}
Content: ${e.bodyContent.slice(0, 800)} // snippet of full body
---`;
    });

    const emailContext = contextLines.join("\n\n");

    // 4. Generate Answer using Gemini Chat Agent
    const reply = await askAgentAboutEmails(query, emailContext, chatModel);

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
