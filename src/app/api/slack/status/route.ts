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

    const account = await db.account.findFirst({
      where: { userId, provider: "slack" },
    });

    const isSandbox = !process.env.SLACK_CLIENT_ID;

    if (account) {
      return NextResponse.json({
        connected: true,
        workspace: account.token_type || "Slack Workspace",
        botName: account.scope || "Repeatless Bot",
        sandbox: isSandbox,
      });
    }

    return NextResponse.json({
      connected: false,
      sandbox: isSandbox,
    });
  } catch (error: any) {
    console.error("Slack status error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
