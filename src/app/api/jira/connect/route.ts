import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const { searchParams } = new URL(req.url);
    const isSandbox = !process.env.JIRA_CLIENT_ID || !process.env.JIRA_CLIENT_SECRET;

    const nextAuthUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const redirectUri = `${nextAuthUrl}/api/jira/callback`;

    if (isSandbox) {
      // In sandbox mode, redirect to callback with a sandbox flag
      const sandboxAuthUrl = `/api/jira/callback?state=${userId}&sandbox=true`;
      return NextResponse.redirect(new URL(sandboxAuthUrl, req.url));
    } else {
      // Real Atlassian OAuth redirect
      const clientId = process.env.JIRA_CLIENT_ID;
      const scopes = "read:jira-work write:jira-work offline_access";
      const state = userId; // Store userId as state to pair tokens
      
      const authUrl = `https://auth.atlassian.com/authorize?audience=api.atlassian.com&client_id=${clientId}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&response_type=code&prompt=consent`;
      
      return NextResponse.redirect(authUrl);
    }
  } catch (error: any) {
    console.error("Jira connect error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
