import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// Helper to refresh Atlassian access token if needed
async function getJiraAccessToken(account: any) {
  if (!account.expires_at || account.expires_at > Math.floor(Date.now() / 1000) + 60) {
    return account.access_token;
  }

  try {
    const response = await fetch("https://auth.atlassian.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: process.env.JIRA_CLIENT_ID,
        client_secret: process.env.JIRA_CLIENT_SECRET,
        refresh_token: account.refresh_token,
      }),
    });

    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error_description || "Token refresh failed");
    }

    const updated = await db.account.update({
      where: { id: account.id },
      data: {
        access_token: data.access_token,
        refresh_token: data.refresh_token || account.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      },
    });

    return updated.access_token;
  } catch (error) {
    console.error("Failed to refresh Jira token:", error);
    return account.access_token;
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const body = await req.json();
    const { projectId, projectKey, issueTypeId, summary, description } = body;

    if (!projectId || !projectKey || !issueTypeId || !summary || !description) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Fetch the user's Jira account credentials
    const account = await db.account.findFirst({
      where: { userId, provider: "jira" },
    });

    if (!account) {
      return NextResponse.json({ error: "Jira integration not connected" }, { status: 400 });
    }

    const isSandbox = account.providerAccountId.startsWith("sandbox-");
    const siteUrl = account.id_token || "repeatless-sandbox.atlassian.net";

    if (isSandbox) {
      // Mock creating Jira issue
      const mockId = Math.floor(Math.random() * 800) + 100;
      const issueKey = `${projectKey}-${mockId}`;
      const issueLink = `https://${siteUrl}/browse/${issueKey}`;

      return NextResponse.json({
        success: true,
        sandbox: true,
        key: issueKey,
        id: `mock-id-${mockId}`,
        self: issueLink,
        url: issueLink,
      });
    }

    // Real Mode - Call Atlassian Jira API
    const accessToken = await getJiraAccessToken(account);
    const cloudId = account.providerAccountId;

    // Construct Atlassian Document Format (ADF) description
    const issuePayload = {
      fields: {
        project: {
          id: projectId,
        },
        summary: summary,
        description: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: description,
                },
              ],
            },
          ],
        },
        issuetype: {
          id: issueTypeId,
        },
      },
    };

    const response = await fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(issuePayload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Jira API issue creation error:", data);
      return NextResponse.json({ 
        error: "Failed to create Jira issue", 
        details: data.errors || data.errorMessages || "Unknown error" 
      }, { status: response.status });
    }

    const issueKey = data.key;
    const issueLink = `https://${siteUrl}/browse/${issueKey}`;

    return NextResponse.json({
      success: true,
      sandbox: false,
      key: issueKey,
      id: data.id,
      self: data.self,
      url: issueLink,
    });

  } catch (error: any) {
    console.error("Jira issue route error:", error);
    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
}
