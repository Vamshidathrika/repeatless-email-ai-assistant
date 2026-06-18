import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { summarizeThreadEmail } from "@/lib/gemini";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const { emailId } = await req.json();

    if (!emailId) {
      return NextResponse.json({ error: "Email ID is required" }, { status: 400 });
    }

    // 1. Fetch the target email
    const email = await db.email.findUnique({
      where: { id: emailId, userId },
      include: { summary: true }
    });

    if (!email) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }

    // 2. Fetch User preference for model settings
    const preference = await db.userPreference.findUnique({
      where: { userId }
    });
    const summaryModel = preference?.summaryModel || "gemini-2.5-flash-lite";

    // 3. Fetch chronological thread context
    const threadEmails = await db.email.findMany({
      where: {
        userId,
        threadId: email.threadId,
      },
      orderBy: { date: "asc" }
    });

    let threadContextText = "";
    for (const msg of threadEmails) {
      if (msg.date.getTime() < email.date.getTime()) {
        threadContextText += `From: ${msg.sender}\nDate: ${msg.date.toISOString()}\nSubject: ${msg.subject}\nContent:\n${msg.bodyContent.slice(0, 3000)}\n---\n`;
      }
    }

    // Trigger Gemini summary
    const summary = await summarizeThreadEmail(
      email.subject,
      email.sender,
      email.bodyContent,
      threadContextText,
      summaryModel
    );

    // 5. Save/Update summary in database
    await db.emailSummary.upsert({
      where: { emailId },
      update: {
        shortSummary: summary.shortSummary,
        detailedSummary: summary.detailedSummary,
        actionItems: JSON.stringify(summary.actionItems),
        category: summary.category,
        importanceScore: summary.importanceScore,
        replySuggestions: JSON.stringify(summary.replySuggestions),
      },
      create: {
        emailId,
        shortSummary: summary.shortSummary,
        detailedSummary: summary.detailedSummary,
        actionItems: JSON.stringify(summary.actionItems),
        category: summary.category,
        importanceScore: summary.importanceScore,
        replySuggestions: JSON.stringify(summary.replySuggestions),
      }
    });

    // 6. Return fully updated email object
    const updatedEmail = await db.email.findUnique({
      where: { id: emailId },
      include: { summary: true }
    });

    return NextResponse.json({
      success: true,
      email: updatedEmail
    });
  } catch (error: any) {
    console.error("On-the-fly summarization error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to summarize email on-the-fly" },
      { status: 500 }
    );
  }
}
