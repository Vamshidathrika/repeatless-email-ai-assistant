import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getGmailClient } from "@/lib/gmail";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const body = await req.json().catch(() => ({}));
    const strategy = body.strategy || "both";

    const gmail = await getGmailClient(userId);

    const conditions: any[] = [];
    if (strategy === "duplicates" || strategy === "both") {
      conditions.push({ isDuplicate: true });
    }
    if (strategy === "promotions" || strategy === "both") {
      conditions.push({
        summary: {
          category: "Promotions",
        },
      });
    }

    if (conditions.length === 0) {
      return NextResponse.json({ success: true, trashedCount: 0, failedCount: 0, freedBytesEstimate: 0 });
    }

    // Find all matching emails from this user
    const emailsToTrash = await db.email.findMany({
      where: {
        userId,
        OR: conditions,
      },
      select: {
        id: true,
      },
    });

    let successCount = 0;
    let failCount = 0;

    for (const email of emailsToTrash) {
      try {
        await gmail.users.messages.trash({
          userId: "me",
          id: email.id,
        });

        // Delete from local database
        await db.email.delete({
          where: { id: email.id },
        });

        successCount++;
      } catch (err) {
        console.error(`Failed to trash message ${email.id}:`, err);
        failCount++;
      }
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
