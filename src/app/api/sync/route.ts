import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { syncEmails } from "@/lib/gmail";
import { db } from "@/lib/db";
import crypto from "crypto";

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

    // ── After Sync: Real-time PA cache invalidation ──────────────────────
    // If new emails were found, clear the AI PA's query cache so it re-indexes
    // fresh summaries on the next chat query (no stale responses).
    if (stats.newEmails > 0) {
      await db.queryCache.deleteMany({ where: { userId } });
      console.log(`[Sync] Cleared PA query cache for user ${userId} (${stats.newEmails} new emails)`);

      // ── Real-time Webhook Trigger ────────────────────────────────────────
      // Find all enabled workflows that have a send_to_webhook or send_to_slack
      // action and are configured for real-time mode (triggerOnSync = true or
      // any workflow that includes a webhook/slack step — fire immediately).
      try {
        const workflows = await db.workflow.findMany({
          where: { userId, enabled: true },
        });

        for (const workflow of workflows) {
          let actions: any[] = [];
          try {
            actions = JSON.parse(workflow.actions);
          } catch {
            continue;
          }

          const hasRealtimeAction = actions.some(
            (a: any) => a.type === "send_to_webhook" || a.type === "send_to_slack"
          );

          if (!hasRealtimeAction) continue;

          // Build a digest text from the new email count
          const digestText = `*📧 Real-time Email Digest*\n\n${stats.newEmails} new email(s) synced and summarized at ${new Date().toLocaleTimeString()}.\n_Triggered automatically by Repeatless on new mail arrival._`;

          // Fire each real-time action
          for (const action of actions) {
            if (action.type === "send_to_webhook") {
              const webhook = await db.webhookConnection.findFirst({
                where: { id: action.webhookId, userId },
              });
              if (!webhook) continue;

              const payload = {
                event: "realtime_email_digest",
                workflow: workflow.name,
                timestamp: new Date().toISOString(),
                newEmails: stats.newEmails,
                totalProcessed: stats.processed,
                summary: digestText,
              };

              const headers: Record<string, string> = {
                "Content-Type": "application/json",
                "X-Repeatless-Event": "realtime_email_digest",
              };

              // Parse custom headers
              if (webhook.headers) {
                try {
                  const customHeaders = JSON.parse(webhook.headers);
                  Object.assign(headers, customHeaders);
                } catch {}
              }

              // HMAC signing
              if (webhook.secret) {
                const body = JSON.stringify(payload);
                const sig = crypto
                  .createHmac("sha256", webhook.secret)
                  .update(body)
                  .digest("hex");
                headers["X-Repeatless-Signature"] = `sha256=${sig}`;
              }

              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 10000);
              try {
                const resp = await fetch(webhook.url, {
                  method: webhook.method || "POST",
                  headers,
                  body: JSON.stringify(payload),
                  signal: controller.signal,
                });
                clearTimeout(timeout);
                await db.webhookConnection.update({
                  where: { id: webhook.id },
                  data: {
                    lastTestedAt: new Date(),
                    lastTestStatus: resp.ok ? "success" : "error",
                    lastTestCode: resp.status,
                  },
                });
                console.log(`[Sync] Fired realtime webhook '${webhook.name}' → ${resp.status}`);
              } catch (fetchErr: any) {
                clearTimeout(timeout);
                console.error(`[Sync] Webhook '${webhook.name}' failed:`, fetchErr.message);
              }
            }

            if (action.type === "send_to_slack") {
              const slackAccount = await db.account.findFirst({
                where: { userId, provider: "slack" },
              });
              if (!slackAccount?.access_token) continue;

              const isSandbox =
                !process.env.SLACK_CLIENT_ID ||
                slackAccount.access_token.startsWith("xoxb-sandbox");

              if (isSandbox) {
                console.log(
                  `[Sync][Sandbox] Would post to Slack #${action.channelName}: ${stats.newEmails} new emails`
                );
              } else {
                try {
                  await fetch("https://slack.com/api/chat.postMessage", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${slackAccount.access_token}`,
                    },
                    body: JSON.stringify({
                      channel: action.channelId,
                      text: digestText,
                      blocks: [
                        {
                          type: "section",
                          text: { type: "mrkdwn", text: digestText },
                        },
                      ],
                    }),
                  });
                  console.log(`[Sync] Posted realtime digest to Slack #${action.channelName}`);
                } catch (slackErr: any) {
                  console.error("[Sync] Slack realtime post failed:", slackErr.message);
                }
              }
            }
          }
        }
      } catch (realtimeErr) {
        // Don't fail the sync response if real-time triggers fail
        console.error("[Sync] Real-time webhook trigger error:", realtimeErr);
      }
    }

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
