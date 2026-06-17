import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { draftReply } from "@/lib/gemini";
import { sendGmailReply } from "@/lib/gmail";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const body = await req.json();
    const { action } = body;

    if (action === "draft") {
      const { threadId, userInstruction } = body;
      if (!threadId || !userInstruction) {
        return NextResponse.json({ error: "Missing threadId or userInstruction" }, { status: 400 });
      }

      // Fetch the thread emails to build context
      const threadEmails = await db.email.findMany({
        where: { userId, threadId },
        orderBy: { date: "asc" },
      });

      if (threadEmails.length === 0) {
        return NextResponse.json({ error: "Thread not found in database" }, { status: 404 });
      }

      // Format the thread emails as historical text
      const threadContext = threadEmails
        .map((e: any) => `From: ${e.sender}\nDate: ${e.date.toISOString()}\nSubject: ${e.subject}\nBody:\n${e.bodyContent}\n---`)
        .join("\n\n");

      const latestEmail = threadEmails[threadEmails.length - 1];
      const draft = await draftReply(
        latestEmail.subject,
        latestEmail.sender,
        threadContext,
        userInstruction
      );

      return NextResponse.json({
        success: true,
        draft,
      });
    } else if (action === "send") {
      const { threadId, replyText, recipient, subject } = body;
      if (!threadId || !replyText || !recipient || !subject) {
        return NextResponse.json({ error: "Missing required fields for sending" }, { status: 400 });
      }

      const sendResult = await sendGmailReply(userId, threadId, replyText, recipient, subject);

      return NextResponse.json({
        success: true,
        sendResult,
      });
    } else {
      return NextResponse.json({ error: "Invalid action. Must be 'draft' or 'send'" }, { status: 400 });
    }
  } catch (error: any) {
    console.error("Reply API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process reply action" },
      { status: 500 }
    );
  }
}
