import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isSandbox = !process.env.SLACK_CLIENT_ID;
    const nextAuthUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

    if (isSandbox) {
      // Sandbox mode — redirect to callback with sandbox flag
      return NextResponse.redirect(new URL("/api/slack/callback?sandbox=true", req.url));
    }

    // Real Slack OAuth redirect
    const clientId = process.env.SLACK_CLIENT_ID;
    const scopes = "chat:write,channels:read,channels:join,groups:read,im:read,mpim:read";
    const redirectUri = `${nextAuthUrl}/api/slack/callback`;
    const state = Math.random().toString(36).substring(2, 18);

    const authUrl =
      `https://slack.com/oauth/v2/authorize` +
      `?client_id=${clientId}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}`;

    return NextResponse.redirect(authUrl);
  } catch (error: any) {
    console.error("Slack connect error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
