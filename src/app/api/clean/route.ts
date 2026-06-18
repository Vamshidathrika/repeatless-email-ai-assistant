import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getGmailClient } from "@/lib/gmail";

// Helper to trash messages in chunks using batchTrash with individual fallback
async function trashMessagesResilient(gmail: any, ids: string[]): Promise<{ successCount: number; failCount: number }> {
  let successCount = 0;
  let failCount = 0;

  // Gmail batchTrash allows up to 1000 ids per call
  const chunkSize = 1000;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    try {
      await gmail.users.messages.batchTrash({
        userId: "me",
        requestBody: {
          ids: chunk,
        },
      });
      successCount += chunk.length;
    } catch (batchErr) {
      console.warn("Gmail batchTrash failed, falling back to individual trash calls for this chunk:", batchErr);
      // Fallback to trashing them individually in this chunk
      for (const id of chunk) {
        try {
          await gmail.users.messages.trash({
            userId: "me",
            id: id,
          });
          successCount++;
        } catch (individualErr) {
          console.error(`Failed to trash message ${id}:`, individualErr);
          failCount++;
        }
      }
    }
  }

  return { successCount, failCount };
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const body = await req.json().catch(() => ({}));
    const strategy = body.strategy;
    const sender = body.sender;
    const emailIds = body.emailIds; // Array of IDs to delete

    const gmail = await getGmailClient(userId);

    let idsToTrash: string[] = [];

    if (emailIds && Array.isArray(emailIds) && emailIds.length > 0) {
      // Clean specific list of emails
      idsToTrash = emailIds;
    } else if (sender) {
      // Clean all emails from a specific sender, all-time in Gmail
      try {
        const emailMatch = sender.match(/<([^>]+)>/);
        const cleanSenderEmail = emailMatch ? emailMatch[1] : sender;

        // Query Gmail for all-time messages from this sender (up to 1000 results)
        const gmailList = await gmail.users.messages.list({
          userId: "me",
          q: `from:${cleanSenderEmail}`,
          maxResults: 1000,
        });

        const messages = gmailList.data.messages || [];
        idsToTrash = messages.map((m) => m.id as string).filter(Boolean);
      } catch (err) {
        console.error("Failed to query Gmail for all-time messages from sender, falling back to local database search:", err);
        const localEmails = await db.email.findMany({
          where: {
            userId,
            sender: {
              contains: sender,
              mode: "insensitive",
            },
          },
          select: {
            id: true,
          },
        });
        idsToTrash = localEmails.map((e) => e.id);
      }
    } else {
      // Use predefined strategies (duplicates, promotions, both)
      const activeStrategy = strategy || "both";
      const conditions: any[] = [];
      if (activeStrategy === "duplicates" || activeStrategy === "both") {
        conditions.push({ isDuplicate: true });
      }
      if (activeStrategy === "promotions" || activeStrategy === "both") {
        conditions.push({
          summary: {
            category: "Promotions",
          },
        });
      }

      if (conditions.length > 0) {
        const localEmails = await db.email.findMany({
          where: {
            userId,
            OR: conditions,
          },
          select: {
            id: true,
          },
        });
        idsToTrash = localEmails.map((e) => e.id);
      }
    }

    if (idsToTrash.length === 0) {
      return NextResponse.json({ success: true, trashedCount: 0, failedCount: 0, freedBytesEstimate: 0 });
    }

    // Call resilient batch trashing helper
    const { successCount, failCount } = await trashMessagesResilient(gmail, idsToTrash);

    // Delete from local database in one batch query for all successfully trashed IDs
    if (idsToTrash.length > 0) {
      await db.email.deleteMany({
        where: {
          id: { in: idsToTrash },
        },
      });
    }

    return NextResponse.json({
      success: true,
      trashedCount: successCount,
      failedCount: failCount,
      freedBytesEstimate: successCount * 25000, // Estimate 25KB per email
    });
  } catch (error: any) {
    console.error("Cleanup Route Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to perform cleanup operations" },
      { status: 500 }
    );
  }
}
