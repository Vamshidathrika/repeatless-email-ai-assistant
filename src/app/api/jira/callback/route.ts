import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Helper to return HTML responses
function htmlResponse(html: string) {
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state"); // state represents the userId
    const sandbox = searchParams.get("sandbox");
    const sandboxApproved = searchParams.get("sandbox_approved");
    const selectedSite = searchParams.get("site") || "repeatless-sandbox.atlassian.net";

    const nextAuthUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

    // 1. Sandbox Consent Page Rendering
    if (sandbox === "true" && state) {
      return htmlResponse(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Authorize Repeatless on Jira</title>
          <style>
            :root {
              --bg: #090b11;
              --surface: #0f121d;
              --border: rgba(255, 255, 255, 0.08);
              --primary: #0052CC; /* Atlassian Blue */
              --primary-hover: #0747A6;
              --text: #f3f4f6;
              --text-dim: #9ca3af;
            }
            body {
              background-color: var(--bg);
              color: var(--text);
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              padding: 1.5rem;
              box-sizing: border-box;
            }
            .card {
              background: var(--surface);
              border: 1px solid var(--border);
              border-radius: 12px;
              width: 100%;
              max-width: 440px;
              padding: 2rem;
              box-shadow: 0 10px 25px rgba(0,0,0,0.4);
              text-align: center;
            }
            .logo-row {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 1rem;
              margin-bottom: 1.5rem;
            }
            .logo {
              width: 48px;
              height: 48px;
              border-radius: 8px;
              background: #fff;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: bold;
              font-size: 20px;
              box-shadow: 0 4px 10px rgba(0,0,0,0.2);
            }
            .logo-repeatless {
              background: linear-gradient(135deg, #6366f1, #38bdf8);
              color: white;
            }
            .logo-jira {
              background: #0052cc;
              color: white;
            }
            .arrow {
              font-size: 24px;
              color: var(--text-dim);
            }
            h2 {
              margin-top: 0;
              font-size: 1.25rem;
              font-weight: 600;
            }
            p {
              font-size: 0.88rem;
              color: var(--text-dim);
              line-height: 1.5;
            }
            .scopes-box {
              background: rgba(255,255,255,0.02);
              border: 1px solid var(--border);
              border-radius: 6px;
              padding: 0.75rem;
              text-align: left;
              margin: 1.5rem 0;
              font-size: 0.8rem;
            }
            .scope-item {
              display: flex;
              align-items: flex-start;
              gap: 0.5rem;
              margin-bottom: 0.5rem;
            }
            .scope-item:last-child {
              margin-bottom: 0;
            }
            .select-label {
              display: block;
              text-align: left;
              font-size: 0.8rem;
              font-weight: 600;
              margin-bottom: 0.35rem;
              color: var(--text-dim);
            }
            select {
              width: 100%;
              padding: 0.6rem;
              background: var(--bg);
              border: 1px solid var(--border);
              border-radius: 6px;
              color: white;
              font-size: 0.85rem;
              margin-bottom: 1.5rem;
              outline: none;
            }
            .buttons {
              display: flex;
              gap: 0.75rem;
            }
            .btn {
              flex: 1;
              padding: 0.75rem;
              border-radius: 6px;
              font-size: 0.88rem;
              font-weight: 600;
              cursor: pointer;
              border: none;
              transition: all 0.2s;
            }
            .btn-primary {
              background: var(--primary);
              color: white;
            }
            .btn-primary:hover {
              background: var(--primary-hover);
            }
            .btn-secondary {
              background: transparent;
              border: 1px solid var(--border);
              color: var(--text-dim);
            }
            .btn-secondary:hover {
              border-color: var(--text-dim);
              color: white;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="logo-row">
              <div class="logo logo-repeatless">R</div>
              <div class="arrow">↔</div>
              <div class="logo logo-jira">J</div>
            </div>
            <h2>Authorize Repeatless</h2>
            <p><strong>Repeatless AI Assistant</strong> is requesting access to connect to your Atlassian account.</p>
            
            <div class="scopes-box">
              <div class="scope-item">
                <span>⚡</span>
                <div><strong>Read Jira items</strong>: Allows viewing projects, issue types, and existing tickets.</div>
              </div>
              <div class="scope-item">
                <span>📝</span>
                <div><strong>Write Jira items</strong>: Allows creating issues and logging comment updates.</div>
              </div>
            </div>

            <label class="select-label">Select Site</label>
            <select id="siteSelect">
              <option value="repeatless-sandbox.atlassian.net">repeatless-sandbox.atlassian.net (Primary)</option>
              <option value="acme-corp.atlassian.net">acme-corp.atlassian.net</option>
              <option value="mycompany-dev.atlassian.net">mycompany-dev.atlassian.net</option>
            </select>

            <div class="buttons">
              <button class="btn btn-secondary" onclick="window.close()">Cancel</button>
              <button class="btn btn-primary" onclick="approve()">Authorize</button>
            </div>
          </div>

          <script>
            function approve() {
              const site = document.getElementById("siteSelect").value;
              window.location.href = "/api/jira/callback?state=${state}&sandbox_approved=true&site=" + encodeURIComponent(site);
            }
          </script>
        </body>
        </html>
      `);
    }

    // 2. Sandbox Approval Processing
    if (sandboxApproved === "true" && state) {
      // Upsert mock Jira account for the user
      await db.account.upsert({
        where: {
          provider_providerAccountId: {
            provider: "jira",
            providerAccountId: `sandbox-${selectedSite}`,
          },
        },
        update: {
          access_token: `mock-access-token-${selectedSite}`,
          refresh_token: "mock-refresh-token",
          scope: "read:jira-work write:jira-work offline_access",
          id_token: selectedSite, // Store selected site name in id_token
        },
        create: {
          userId: state,
          type: "oauth",
          provider: "jira",
          providerAccountId: `sandbox-${selectedSite}`,
          access_token: `mock-access-token-${selectedSite}`,
          refresh_token: "mock-refresh-token",
          scope: "read:jira-work write:jira-work offline_access",
          id_token: selectedSite, // Store selected site name in id_token
        },
      });

      return htmlResponse(`
        <!DOCTYPE html>
        <html>
        <head><title>Authorization Successful</title></head>
        <body style="background:#090b11;color:#f3f4f6;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;">
            <h2 style="color:#34d399;">✓ Jira Connected Successfully!</h2>
            <p style="color:#9ca3af;">This window will close automatically.</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage("jira-connected", "*");
            }
            setTimeout(function() { window.close(); }, 1500);
          </script>
        </body>
        </html>
      `);
    }

    // 3. Real Jira OAuth Callback Exchange
    if (code && state) {
      const isSandbox = !process.env.JIRA_CLIENT_ID || !process.env.JIRA_CLIENT_SECRET;
      if (isSandbox) {
        return NextResponse.json({ error: "Invalid state for sandbox callback" }, { status: 400 });
      }

      // Exchange Atlassian OAuth Code
      const response = await fetch("https://auth.atlassian.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: process.env.JIRA_CLIENT_ID,
          client_secret: process.env.JIRA_CLIENT_SECRET,
          code,
          redirect_uri: `${nextAuthUrl}/api/jira/callback`,
        }),
      });

      const tokenData = await response.json();

      if (!response.ok || tokenData.error) {
        console.error("Atlassian OAuth exchange failed:", tokenData);
        return htmlResponse(`
          <!DOCTYPE html>
          <html>
          <body style="background:#090b11;color:#f87171;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
            <div style="text-align:center;">
              <h2>✗ Connection Failed</h2>
              <p style="color:#9ca3af;">${tokenData.error_description || "Failed to exchange OAuth token."}</p>
              <button onclick="window.close()" style="margin-top:1rem;padding:0.5rem 1rem;background:rgba(255,255,255,0.08);color:white;border:1px solid rgba(255,255,255,0.15);cursor:pointer;border-radius:4px;">Close Window</button>
            </div>
          </body>
          </html>
        `);
      }

      // Fetch accessible sites (cloudids)
      const resResource = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: "application/json",
        },
      });

      const resources = await resResource.json();
      if (!resResource.ok || !resources.length) {
        console.error("Failed to fetch accessible resources:", resources);
        return htmlResponse(`
          <body style="background:#090b11;color:#f87171;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
            <div style="text-align:center;">
              <h2>✗ Access Denied</h2>
              <p style="color:#9ca3af;">Could not locate any accessible Jira Cloud instances.</p>
            </div>
          </body>
        `);
      }

      // Use the first site
      const primarySite = resources[0]; // { id: cloudId, url: siteUrl, name: siteName }
      const cloudId = primarySite.id;
      const siteUrl = primarySite.url.replace(/^https?:\/\//, ""); // clean domain

      // Save in Account table
      await db.account.upsert({
        where: {
          provider_providerAccountId: {
            provider: "jira",
            providerAccountId: cloudId,
          },
        },
        update: {
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_at: Math.floor(Date.now() / 1000) + (tokenData.expires_in || 3600),
          scope: tokenData.scope,
          id_token: siteUrl, // Store site domain URL in id_token
        },
        create: {
          userId: state,
          type: "oauth",
          provider: "jira",
          providerAccountId: cloudId,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_at: Math.floor(Date.now() / 1000) + (tokenData.expires_in || 3600),
          scope: tokenData.scope,
          id_token: siteUrl, // Store site domain URL in id_token
        },
      });

      return htmlResponse(`
        <!DOCTYPE html>
        <html>
        <head><title>Authorization Successful</title></head>
        <body style="background:#090b11;color:#f3f4f6;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;">
            <h2 style="color:#34d399;">✓ Jira Connected Successfully!</h2>
            <p style="color:#9ca3af;">Connected to ${siteUrl}</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage("jira-connected", "*");
            }
            setTimeout(function() { window.close(); }, 1500);
          </script>
        </body>
        </html>
      `);
    }

    return NextResponse.json({ error: "Invalid Request" }, { status: 400 });
  } catch (error: any) {
    console.error("Jira callback error:", error);
    return htmlResponse(`
      <body style="background:#090b11;color:#f87171;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
        <div style="text-align:center;">
          <h2>✗ System Error</h2>
          <p style="color:#9ca3af;">An error occurred during authentication callback processing.</p>
        </div>
      </body>
    `);
  }
}
