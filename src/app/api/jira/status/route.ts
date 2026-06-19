import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;

    // Check if Jira account exists for this user in DB
    const account = await db.account.findFirst({
      where: { userId, provider: "jira" },
    });

    const isSandboxMode = !process.env.JIRA_CLIENT_ID || !process.env.JIRA_CLIENT_SECRET;

    return NextResponse.json({
      connected: !!account,
      sandbox: isSandboxMode,
      accountId: account?.id || null,
      scope: account?.scope || null,
    });
  } catch (error: any) {
    console.error("Jira status error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
