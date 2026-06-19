import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
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
    const sandboxParam = searchParams.get("sandbox");

    const nextAuthUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const isSandboxMode = !process.env.SLACK_CLIENT_ID;

    // ─── Sandbox Mode ─────────────────────────────────────────────────────────
    if (sandboxParam === "true" || isSandboxMode) {
      const session = await getServerSession(authOptions);

      if (!session || !session.user || !(session.user as any).id) {
        return NextResponse.redirect(new URL("/", req.url));
      }

      const userId = (session.user as any).id;

      // Upsert a mock sandbox Slack account
      await db.account.upsert({
        where: {
          provider_providerAccountId: {
            provider: "slack",
            providerAccountId: "sandbox_team",
          },
        },
        update: {
          access_token: "xoxb-sandbox-token",
          token_type: "Demo Workspace",
          scope: "Repeatless Bot",
          userId,
        },
        create: {
          userId,
          provider: "slack",
          providerAccountId: "sandbox_team",
          type: "oauth",
          access_token: "xoxb-sandbox-token",
          token_type: "Demo Workspace",
          scope: "Repeatless Bot",
        },
      });

      return htmlResponse(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Allow access to Slack</title>
          <style>
            :root {
              --bg: #1a0a1e;
              --surface: #220e27;
              --surface2: #2d1133;
              --border: rgba(255, 255, 255, 0.08);
              --primary: #4A154B;
              --primary-hover: #611760;
              --accent: #36C5F0;
              --text: #f3f4f6;
              --text-dim: #9ca3af;
            }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              background: radial-gradient(ellipse at top, #2d0d35 0%, #0f0512 60%);
              color: var(--text);
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              padding: 1.5rem;
            }
            .card {
              background: var(--surface);
              border: 1px solid rgba(74, 21, 75, 0.4);
              border-radius: 16px;
              width: 100%;
              max-width: 420px;
              padding: 2rem;
              box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(74,21,75,0.2);
              text-align: center;
            }
            .logo-row {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 1rem;
              margin-bottom: 1.75rem;
            }
            .logo {
              width: 52px;
              height: 52px;
              border-radius: 10px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: 800;
              font-size: 22px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.4);
              flex-shrink: 0;
            }
            .logo-repeatless {
              background: linear-gradient(135deg, #6366f1, #38bdf8);
              color: white;
            }
            .logo-slack {
              background: #4A154B;
              color: white;
              font-size: 18px;
              letter-spacing: -1px;
            }
            .logo-slack-inner {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 3px;
              width: 28px;
              height: 28px;
            }
            .slack-dot {
              border-radius: 50%;
              width: 11px;
              height: 11px;
            }
            .sd1 { background: #E01E5A; }
            .sd2 { background: #36C5F0; }
            .sd3 { background: #2EB67D; }
            .sd4 { background: #ECB22E; }
            .arrow {
              font-size: 20px;
              color: var(--text-dim);
            }
            h2 {
              font-size: 1.2rem;
              font-weight: 700;
              margin-bottom: 0.4rem;
              color: var(--text);
            }
            .subtitle {
              font-size: 0.85rem;
              color: var(--text-dim);
              margin-bottom: 1.5rem;
              line-height: 1.5;
            }
            .app-badge {
              display: inline-flex;
              align-items: center;
              gap: 0.4rem;
              background: rgba(74,21,75,0.3);
              border: 1px solid rgba(74,21,75,0.5);
              border-radius: 20px;
              padding: 0.3rem 0.75rem;
              font-size: 0.8rem;
              font-weight: 600;
              color: #c084fc;
              margin-bottom: 1.5rem;
            }
            .scopes-box {
              background: rgba(255,255,255,0.02);
              border: 1px solid var(--border);
              border-radius: 10px;
              padding: 0.85rem;
              text-align: left;
              margin-bottom: 1.5rem;
            }
            .scopes-label {
              font-size: 0.7rem;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.08em;
              color: var(--text-dim);
              margin-bottom: 0.65rem;
            }
            .scope-item {
              display: flex;
              align-items: flex-start;
              gap: 0.6rem;
              margin-bottom: 0.5rem;
              font-size: 0.82rem;
              color: var(--text);
              line-height: 1.4;
            }
            .scope-item:last-child { margin-bottom: 0; }
            .scope-icon {
              font-size: 14px;
              flex-shrink: 0;
              margin-top: 1px;
            }
            .buttons {
              display: flex;
              gap: 0.65rem;
            }
            .btn {
              flex: 1;
              padding: 0.75rem;
              border-radius: 8px;
              font-size: 0.88rem;
              font-weight: 600;
              cursor: pointer;
              border: none;
              transition: all 0.2s ease;
              letter-spacing: 0.01em;
            }
            .btn-primary {
              background: linear-gradient(135deg, #4A154B, #611760);
              color: white;
              box-shadow: 0 4px 15px rgba(74,21,75,0.4);
            }
            .btn-primary:hover {
              background: linear-gradient(135deg, #611760, #7a1d7c);
              transform: translateY(-1px);
              box-shadow: 0 6px 20px rgba(74,21,75,0.5);
            }
            .btn-primary:active { transform: translateY(0); }
            .btn-secondary {
              background: transparent;
              border: 1px solid var(--border);
              color: var(--text-dim);
            }
            .btn-secondary:hover {
              border-color: var(--text-dim);
              color: var(--text);
              background: rgba(255,255,255,0.04);
            }
            .sandbox-notice {
              margin-top: 1rem;
              font-size: 0.72rem;
              color: rgba(255,255,255,0.25);
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="logo-row">
              <div class="logo logo-repeatless"><img src="/logo-white.png" alt="Aether Logo" style="width: 22px; height: 22px; object-fit: contain;" /></div>
              <div class="arrow">↔</div>
              <div class="logo logo-slack">
                <div class="logo-slack-inner">
                  <div class="slack-dot sd1"></div>
                  <div class="slack-dot sd2"></div>
                  <div class="slack-dot sd3"></div>
                  <div class="slack-dot sd4"></div>
                </div>
              </div>
            </div>

            <h2>Allow access to Slack</h2>
            <p class="subtitle"><strong>Repeatless</strong> is requesting permission to post to your Slack workspace.</p>

            <div class="app-badge">
              <span>⚡</span> Repeatless · Demo Workspace
            </div>

            <div class="scopes-box">
              <div class="scopes-label">Permissions requested</div>
              <div class="scope-item">
                <span class="scope-icon">💬</span>
                <div><strong>Send messages</strong> — Post email digests to channels</div>
              </div>
              <div class="scope-item">
                <span class="scope-icon">📋</span>
                <div><strong>Read channels</strong> — List public and private channels</div>
              </div>
              <div class="scope-item">
                <span class="scope-icon">🔗</span>
                <div><strong>Join channels</strong> — Auto-join selected digest channels</div>
              </div>
              <div class="scope-item">
                <span class="scope-icon">📩</span>
                <div><strong>Read DMs & group messages</strong> — Identify message threads</div>
              </div>
            </div>

            <div class="buttons">
              <button class="btn btn-secondary" onclick="window.close()">Cancel</button>
              <button class="btn btn-primary" onclick="allow()">Allow</button>
            </div>

            <p class="sandbox-notice">Sandbox mode — no real Slack credentials required</p>
          </div>

          <script>
            function allow() {
              const data = {
                type: 'slack_connected',
                data: {
                  connected: true,
                  workspace: 'Demo Workspace',
                  botName: 'Repeatless Bot',
                  sandbox: true
                }
              };
              if (window.opener) {
                window.opener.postMessage(data, '*');
              }
              setTimeout(function() { window.close(); }, 300);
            }
          </script>
        </body>
        </html>
      `);
    }

    // ─── Real OAuth Mode ──────────────────────────────────────────────────────
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.redirect(new URL("/", req.url));
    }

    const userId = (session.user as any).id;

    if (!code) {
      return NextResponse.json({ error: "Missing code parameter" }, { status: 400 });
    }

    const redirectUri = `${nextAuthUrl}/api/slack/callback`;

    // Exchange code for access token
    const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.SLACK_CLIENT_ID!,
        client_secret: process.env.SLACK_CLIENT_SECRET!,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.ok) {
      console.error("Slack OAuth exchange failed:", tokenData.error);
      return htmlResponse(`
        <!DOCTYPE html>
        <html>
        <body style="background:#0f0512;color:#f87171;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;">
            <h2>✗ Slack Connection Failed</h2>
            <p style="color:#9ca3af;">${tokenData.error || "Failed to exchange OAuth token."}</p>
            <button onclick="window.close()" style="margin-top:1rem;padding:0.5rem 1rem;background:rgba(255,255,255,0.08);color:white;border:1px solid rgba(255,255,255,0.15);cursor:pointer;border-radius:4px;">Close</button>
          </div>
        </body>
        </html>
      `);
    }

    const botToken: string = tokenData.access_token;
    const teamId: string = tokenData.team?.id;
    const teamName: string = tokenData.team?.name;
    const botUserId: string = tokenData.bot_user_id;
    const userToken: string | undefined = tokenData.authed_user?.access_token;

    // Upsert Slack account
    await db.account.upsert({
      where: {
        provider_providerAccountId: {
          provider: "slack",
          providerAccountId: teamId,
        },
      },
      update: {
        access_token: botToken,
        token_type: teamName,
        scope: botUserId,
        refresh_token: userToken || null,
        userId,
      },
      create: {
        userId,
        provider: "slack",
        providerAccountId: teamId,
        type: "oauth",
        access_token: botToken,
        token_type: teamName,
        scope: botUserId,
        refresh_token: userToken || null,
      },
    });

    return htmlResponse(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Slack Connected Successfully</title>
        <style>
          :root {
            --bg: #1a0a1e;
            --surface: #220e27;
            --surface2: #2d1133;
            --border: rgba(255, 255, 255, 0.08);
            --primary: #4A154B;
            --primary-hover: #611760;
            --accent: #2EB67D; /* Slack Green */
            --text: #f3f4f6;
            --text-dim: #9ca3af;
          }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            background: radial-gradient(ellipse at top, #2d0d35 0%, #0f0512 60%);
            color: var(--text);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 1.5rem;
          }
          .card {
            background: var(--surface);
            border: 1px solid rgba(46, 182, 125, 0.3);
            border-radius: 16px;
            width: 100%;
            max-width: 420px;
            padding: 2.5rem 2rem;
            box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(46,182,125,0.1);
            text-align: center;
          }
          .checkmark-circle {
            width: 72px;
            height: 72px;
            border-radius: 50%;
            display: block;
            stroke-width: 3;
            stroke: var(--accent);
            margin: 0 auto 1.5rem;
          }
          .checkmark-water {
            stroke-dasharray: 166;
            stroke-dashoffset: 166;
            stroke-width: 3;
            stroke-miterlimit: 10;
            stroke: rgba(46, 182, 125, 0.2);
            animation: stroke 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
          }
          .checkmark-check {
            transform-origin: 50% 50%;
            stroke-dasharray: 48;
            stroke-dashoffset: 48;
            stroke-width: 4;
            stroke-linecap: round;
            animation: stroke 0.4s cubic-bezier(0.65, 0, 0.45, 1) 0.5s forwards;
          }
          @keyframes stroke {
            100% {
              stroke-dashoffset: 0;
            }
          }
          .connection-status {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.75rem;
            margin-bottom: 1.75rem;
          }
          .logo {
            width: 48px;
            height: 48px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            font-size: 20px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            flex-shrink: 0;
          }
          .logo-repeatless {
            background: linear-gradient(135deg, #6366f1, #38bdf8);
            color: white;
          }
          .logo-slack {
            background: #4A154B;
            color: white;
          }
          .logo-slack-inner {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 2.5px;
            width: 24px;
            height: 24px;
          }
          .slack-dot {
            border-radius: 50%;
            width: 9.5px;
            height: 9.5px;
          }
          .sd1 { background: #E01E5A; }
          .sd2 { background: #36C5F0; }
          .sd3 { background: #2EB67D; }
          .sd4 { background: #ECB22E; }
          .connection-line {
            width: 50px;
            height: 2px;
            background: rgba(255, 255, 255, 0.1);
            position: relative;
            overflow: hidden;
          }
          .connection-line-active {
            position: absolute;
            left: 0;
            top: 0;
            height: 100%;
            width: 50%;
            background: linear-gradient(90deg, transparent, var(--accent), transparent);
            animation: slide 1.5s infinite linear;
          }
          @keyframes slide {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(200%); }
          }
          h2 {
            font-size: 1.25rem;
            font-weight: 700;
            margin-bottom: 0.5rem;
            color: var(--text);
          }
          .subtitle {
            font-size: 0.9rem;
            color: var(--text-dim);
            margin-bottom: 1.5rem;
            line-height: 1.5;
          }
          .workspace-badge {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            background: rgba(46, 182, 125, 0.1);
            border: 1px solid rgba(46, 182, 125, 0.25);
            border-radius: 20px;
            padding: 0.35rem 0.85rem;
            font-size: 0.82rem;
            font-weight: 600;
            color: #34d399;
            margin-bottom: 1.5rem;
          }
          .btn {
            width: 100%;
            padding: 0.8rem;
            border-radius: 8px;
            font-size: 0.9rem;
            font-weight: 600;
            cursor: pointer;
            border: none;
            transition: all 0.2s ease;
          }
          .btn-primary {
            background: linear-gradient(135deg, #2EB67D, #228b5e);
            color: white;
            box-shadow: 0 4px 15px rgba(46, 182, 125, 0.3);
          }
          .btn-primary:hover {
            background: linear-gradient(135deg, #34d399, #2eb67d);
            transform: translateY(-1px);
            box-shadow: 0 6px 20px rgba(46, 182, 125, 0.4);
          }
          .btn-primary:active { transform: translateY(0); }
          .progress-bar-container {
            width: 100%;
            height: 3px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 1.5px;
            margin: 1.5rem 0 0.5rem;
            overflow: hidden;
          }
          .progress-bar {
            height: 100%;
            width: 100%;
            background: var(--accent);
            animation: shrink 2.5s linear forwards;
            transform-origin: left;
          }
          @keyframes shrink {
            from { transform: scaleX(1); }
            to { transform: scaleX(0); }
          }
          .closing-text {
            font-size: 0.72rem;
            color: var(--text-dim);
          }
        </style>
      </head>
      <body>
        <div class="card">
          <svg class="checkmark-circle" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
            <circle class="checkmark-water" cx="26" cy="26" r="25" fill="none"/>
            <path class="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
          </svg>

          <h2>Slack Connected!</h2>
          <p class="subtitle">Successfully connected to your Slack workspace.</p>

          <div class="connection-status">
            <div class="logo logo-repeatless"><img src="/logo-white.png" alt="Aether Logo" style="width: 22px; height: 22px; object-fit: contain;" /></div>
            <div class="connection-line">
              <div class="connection-line-active"></div>
            </div>
            <div class="logo logo-slack">
              <div class="logo-slack-inner">
                <div class="slack-dot sd1"></div>
                <div class="slack-dot sd2"></div>
                <div class="slack-dot sd3"></div>
                <div class="slack-dot sd4"></div>
              </div>
            </div>
          </div>

          <div class="workspace-badge">
            <span>Workspace:</span> <strong>${teamName}</strong>
          </div>

          <button class="btn btn-primary" onclick="handleCloseOrDone()">Done</button>

          <div class="progress-bar-container">
            <div class="progress-bar"></div>
          </div>
          <p class="closing-text">This window will close automatically...</p>
        </div>

        <script>
          const data = {
            type: 'slack_connected',
            data: {
              connected: true,
              workspace: ${JSON.stringify(teamName)},
              botName: 'Repeatless Bot',
              sandbox: false
            }
          };
          
          if (window.opener) {
            window.opener.postMessage(data, '*');
            setTimeout(() => {
              window.close();
            }, 2500);
          } else {
            setTimeout(() => {
              window.location.href = '/';
            }, 2500);
          }

          function handleCloseOrDone() {
            if (window.opener) {
              window.close();
            } else {
              window.location.href = '/';
            }
          }
        </script>
      </body>
      </html>
    `);
  } catch (error: any) {
    console.error("Slack callback error:", error);
    return htmlResponse(`
      <body style="background:#0f0512;color:#f87171;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
        <div style="text-align:center;">
          <h2>✗ System Error</h2>
          <p style="color:#9ca3af;">An error occurred during Slack authentication.</p>
        </div>
      </body>
    `);
  }
}
