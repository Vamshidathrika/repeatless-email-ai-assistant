import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// Helper to refresh Atlassian access token if needed
async function getJiraAccessToken(account: any) {
  if (!account.expires_at || account.expires_at > Math.floor(Date.now() / 1000) + 60) {
    return account.access_token;
  }

  // Token is expired or expiring soon, refresh it
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
    return account.access_token; // return current as fallback
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;

    // Fetch the user's Jira account credentials
    const account = await db.account.findFirst({
      where: { userId, provider: "jira" },
    });

    if (!account) {
      return NextResponse.json({ error: "Jira integration not connected" }, { status: 400 });
    }

    const isSandbox = account.providerAccountId.startsWith("sandbox-");

    if (isSandbox) {
      // Sandbox Projects list
      const mockProjects = [
        { id: "10000", key: "ACME", name: "Acme Corp Development" },
        { id: "10001", key: "SUP", name: "Customer Support Desk" },
        { id: "10002", key: "REP", name: "Repeatless App Enhancement" },
      ];

      const mockIssueTypes = [
        { id: "10001", name: "Task", description: "A generic work task" },
        { id: "10004", name: "Bug", description: "A software defect or issue" },
        { id: "10002", name: "Story", description: "A user requirement or feature request" },
        { id: "10000", name: "Epic", description: "A large body of work containing child tasks" },
      ];

      return NextResponse.json({
        success: true,
        sandbox: true,
        siteUrl: account.id_token || "repeatless-sandbox.atlassian.net",
        projects: mockProjects,
        issueTypes: mockIssueTypes,
      });
    }

    // Real Mode - Fetch Projects from Atlassian API
    const accessToken = await getJiraAccessToken(account);
    const cloudId = account.providerAccountId;

    // Get Projects
    const projectsResponse = await fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/project`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (!projectsResponse.ok) {
      const errorData = await projectsResponse.text();
      console.error("Jira API project fetch error:", errorData);
      return NextResponse.json({ error: "Failed to fetch projects from Jira" }, { status: projectsResponse.status });
    }

    const projectsData = await projectsResponse.json();
    const projects = projectsData.map((p: any) => ({
      id: p.id,
      key: p.key,
      name: p.name,
    }));

    // Standard fallback issue types, since issuetypes are usually common
    // and querying the issueType API requires administrative scopes or extra fetches
    const issueTypes = [
      { id: "10001", name: "Task", description: "A generic work task" },
      { id: "10004", name: "Bug", description: "A software defect or issue" },
      { id: "10002", name: "Story", description: "A user requirement or feature request" },
      { id: "10000", name: "Epic", description: "A large body of work containing child tasks" },
    ];

    return NextResponse.json({
      success: true,
      sandbox: false,
      siteUrl: account.id_token || "jira.atlassian.com",
      projects,
      issueTypes,
    });

  } catch (error: any) {
    console.error("Jira projects route error:", error);
    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
}
