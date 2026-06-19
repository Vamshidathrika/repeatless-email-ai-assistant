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

      // Fetch user info for name and preference model
      const user = await db.user.findUnique({
        where: { id: userId }
      });
      const preference = await db.userPreference.findUnique({
        where: { userId }
      });

      const userName = user?.name || "User";
      const chatModel = preference?.chatModel || "gemini-2.5-flash-lite";

      const latestEmail = threadEmails[threadEmails.length - 1];
      const draft = await draftReply(
        latestEmail.subject,
        latestEmail.sender,
        threadContext,
        userInstruction,
        userName,
        chatModel
      );

      return NextResponse.json({
        success: true,
        draft, // structured as { subject: string, body: string }
      });
    } else if (action === "send") {
      const { threadId, replyText, recipient, subject, cc, bcc, attachments } = body;
      if (!replyText || !recipient || !subject) {
        return NextResponse.json({ error: "Missing required fields for sending" }, { status: 400 });
      }

      const sendResult = await sendGmailReply(
        userId, 
        threadId || null, 
        replyText, 
        recipient, 
        subject, 
        cc || null, 
        bcc || null,
        attachments || []
      );

      // Save the sent email to the local database so it immediately updates in the thread list
      if (sendResult && sendResult.id) {
        try {
          const senderEmail = session.user.email || "me@gmail.com";
          const senderName = session.user.name || "Me";
          const senderFormatted = senderName ? `"${senderName}" <${senderEmail}>` : senderEmail;

          // Use the thread ID that Gmail actually assigned (may differ from original if Gmail re-threads)
          // For forwards, threadId may be null — use Gmail's assigned thread ID
          const actualThreadId = (sendResult as any).threadId || threadId || sendResult.id;

          const createdEmail = await db.email.create({
            data: {
              id: sendResult.id,
              threadId: actualThreadId,
              userId: userId,
              subject: subject.startsWith("Re:") ? subject : "Re: " + subject,
              sender: senderFormatted,
              receiver: recipient,
              date: new Date(),
              bodySnippet: replyText.slice(0, 150),
              bodyContent: replyText,
              htmlContent: null,
              unsubscribeUrl: null,
              labels: "SENT",
              isDuplicate: false,
              dedupHash: null
            }
          });

          // Create a summary for the sent message to avoid blank AI views
          await db.emailSummary.create({
            data: {
              emailId: createdEmail.id,
              shortSummary: "You replied to this thread.",
              detailedSummary: `Sent response: "${replyText}"`,
              actionItems: JSON.stringify([]),
              category: "Personal",
              importanceScore: 1,
              replySuggestions: JSON.stringify([])
            }
          });
        } catch (dbErr) {
          console.error("Failed to save sent reply to database:", dbErr);
        }
      }

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
