import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { syncEmails } from "@/lib/gmail";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    
    // Default to syncing the last 20 emails, but allow query param customization
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const stats = await syncEmails(userId, limit);

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error: any) {
    console.error("Sync API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to synchronize emails" },
      { status: 500 }
    );
  }
}
