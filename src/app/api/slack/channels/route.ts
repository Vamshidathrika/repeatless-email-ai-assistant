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

    if (!account) {
      return NextResponse.json({ error: "Slack not connected" }, { status: 404 });
    }

    const isSandbox =
      !process.env.SLACK_CLIENT_ID ||
      (account.access_token?.startsWith("xoxb-sandbox") ?? false);

    if (isSandbox) {
      return NextResponse.json({
        channels: [
          { id: "C001", name: "general" },
          { id: "C002", name: "email-digest" },
          { id: "C003", name: "team-updates" },
          { id: "C004", name: "project-alpha" },
        ],
        sandbox: true,
      });
    }

    // Real mode — fetch from Slack API
    const res = await fetch(
      "https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=100",
      {
        headers: {
          Authorization: `Bearer ${account.access_token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await res.json();

    if (!res.ok || !data.ok) {
      console.error("Slack conversations.list error:", data.error || data);
      return NextResponse.json({ error: "Failed to fetch channels" }, { status: 502 });
    }

    const channels = (data.channels as any[]).map((ch) => ({
      id: ch.id as string,
      name: ch.name as string,
    }));

    return NextResponse.json({ channels, sandbox: false });
  } catch (error: any) {
    console.error("Slack channels error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
