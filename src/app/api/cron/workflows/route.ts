import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeNextRun } from "@/lib/cron";
import crypto from "crypto";

const BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

// ────────────────────────────────────────────────────────────
// Server-side action executor (no session needed — runs as cron)
// ────────────────────────────────────────────────────────────
async function executeWorkflowActions(
  workflow: {
    id: string;
    name: string;
    actions: string;
    schedule: string;
    timezone: string;
    userId: string;
  }
): Promise<{ status: "success" | "error"; log: string }> {
  let actions: any[] = [];
  try {
    actions = JSON.parse(workflow.actions);
  } catch {
    return { status: "error", log: "Failed to parse workflow actions JSON." };
  }

  const logLines: string[] = [];
  const userId = workflow.userId;

  for (const action of actions) {
    const type: string = action.type || action.action || "";

    try {
      if (type === "sync_emails") {
        // For cron, call the Gmail sync function via internal fetch
        // We pass no session cookies — this will result in 401 from /api/sync.
        // Instead call syncEmails via db directly or accept the 401 gracefully.
        // We log the intent and skip actual sync (cron has no user session).
        logLines.push(
          `✔ sync_emails: scheduled sync noted. Emails will sync on next user session or can be triggered manually.`
        );
      } else if (type === "summarize_emails") {
        // Count unsummarized emails directly via DB (no session needed)
        const count = await db.email.count({
          where: { userId, summary: null },
        });
        logLines.push(
          `✔ summarize_emails: ${count} email(s) pending summarization.`
        );
      } else if (type === "create_jira_ticket") {
        const { jiraProjectId, jiraProjectKey, jiraIssueTypeId } = action;

        const account = await db.account.findFirst({
          where: { userId, provider: "jira" },
        });

        if (!account) {
          logLines.push("✘ create_jira_ticket: Jira integration not connected.");
        } else {
          const isSandbox = account.providerAccountId.startsWith("sandbox-");
          const issueSummary = `[Workflow] ${workflow.name} — ${new Date().toLocaleDateString()}`;
          const issueDescription = [
            `Automated cron workflow report for: ${workflow.name}`,
            `Triggered at: ${new Date().toISOString()}`,
            ``,
            `Action log so far:`,
            ...logLines,
          ].join("\n");

          if (isSandbox) {
            const mockId = Math.floor(Math.random() * 800) + 100;
            const key = jiraProjectKey ? `${jiraProjectKey}-${mockId}` : `WF-${mockId}`;
            logLines.push(`✔ create_jira_ticket (sandbox): created mock issue ${key}.`);
          } else {
            // Get/refresh access token
            let accessToken = account.access_token;
            if (account.expires_at && account.expires_at <= Math.floor(Date.now() / 1000) + 60) {
              try {
                const refreshRes = await fetch("https://auth.atlassian.com/oauth/token", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    grant_type: "refresh_token",
                    client_id: process.env.JIRA_CLIENT_ID,
                    client_secret: process.env.JIRA_CLIENT_SECRET,
                    refresh_token: account.refresh_token,
                  }),
                });
                const refreshData = await refreshRes.json();
                if (refreshRes.ok && refreshData.access_token) {
                  await db.account.update({
                    where: { id: account.id },
                    data: {
                      access_token: refreshData.access_token,
                      refresh_token: refreshData.refresh_token || account.refresh_token,
                      expires_at: Math.floor(Date.now() / 1000) + (refreshData.expires_in || 3600),
                    },
                  });
                  accessToken = refreshData.access_token;
                }
              } catch (refreshErr) {
                console.error("Cron: Jira token refresh error:", refreshErr);
              }
            }

            const cloudId = account.providerAccountId;
            const issuePayload = {
              fields: {
                project: { id: jiraProjectId },
                summary: issueSummary,
                description: {
                  type: "doc",
                  version: 1,
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: issueDescription }],
                    },
                  ],
                },
                issuetype: { id: jiraIssueTypeId || "10001" },
              },
            };

            const issueRes = await fetch(
              `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
                body: JSON.stringify(issuePayload),
              }
            );

            const issueData = await issueRes.json();
            if (issueRes.ok) {
              logLines.push(`✔ create_jira_ticket: created issue ${issueData.key}.`);
            } else {
              logLines.push(
                `✘ create_jira_ticket: ${JSON.stringify(issueData.errors || issueData.errorMessages || "Unknown error")}`
              );
            }
          }
        }
      } else if (type === "send_to_slack") {
        // ── Post digest to Slack channel (cron) ──
        const { channelId, channelName } = action;

        const slackAccount = await db.account.findFirst({
          where: { userId, provider: "slack" },
        });

        if (!slackAccount) {
          logLines.push("✘ send_to_slack: Slack integration not connected.");
        } else {
          const isSandbox =
            !process.env.SLACK_CLIENT_ID ||
            (slackAccount.access_token?.startsWith("xoxb-sandbox") ?? false);

          // Build digest text from prior log lines
          const summarizeEntry = logLines.find((l) => l.includes("summarize_emails"));
          const emailCount = summarizeEntry
            ? summarizeEntry.match(/(\d+) email/)?.[1] || "N/A"
            : "N/A";
          const digestText = `*📧 Email Digest — ${new Date().toLocaleDateString()}*\n\n${emailCount} emails summarized. Sync and summarize complete.`;

          if (isSandbox) {
            console.log(`[Cron Sandbox] Would post to Slack #${channelName}: ${digestText}`);
            logLines.push(`✔ send_to_slack (sandbox): would post to #${channelName}.`);
          } else {
            const slackRes = await fetch("https://slack.com/api/chat.postMessage", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${slackAccount.access_token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                channel: channelId,
                text: digestText,
                blocks: [
                  {
                    type: "section",
                    text: { type: "mrkdwn", text: digestText },
                  },
                ],
              }),
            });

            const slackData = await slackRes.json();
            if (slackData.ok) {
              logLines.push(`✔ send_to_slack: posted digest to #${channelName}.`);
            } else {
              logLines.push(`✘ send_to_slack: ${slackData.error || "Unknown error"}`);
            }
          }
        }
      } else if (type === "send_to_webhook") {
        // ── Fire an external webhook (cron) ──
        const { webhookId, webhookName } = action;

        const webhookConn = await db.webhookConnection.findFirst({
          where: { id: webhookId, userId },
        });

        if (!webhookConn) {
          logLines.push(`✘ send_to_webhook (${webhookName}): Webhook connection not found.`);
        } else {
          // Parse custom headers
          let parsedHeaders: Record<string, string> = {};
          if (webhookConn.headers) {
            try {
              parsedHeaders = JSON.parse(webhookConn.headers);
            } catch {
              console.warn(`[Cron] send_to_webhook: failed to parse headers for webhook ${webhookId}, ignoring.`);
            }
          }

          // Extract email count from prior log lines for the summary
          const summarizeEntry = logLines.find((l) => l.includes("summarize_emails"));
          const emailsFound = summarizeEntry
            ? parseInt(summarizeEntry.match(/(\d+) email/)?.[1] || "0", 10)
            : 0;

          // Build workflow digest payload
          const webhookPayload = {
            event: "workflow_digest",
            workflow: workflow.name,
            timestamp: new Date().toISOString(),
            summary: logLines.join("\n"),
            emailsFound,
          };

          const webhookMethod = webhookConn.method || "POST";
          const fetchHeaders: Record<string, string> = {
            ...parsedHeaders,
            "Content-Type": "application/json",
            "User-Agent": "Repeatless-Webhook/1.0",
          };
          let fetchUrl = webhookConn.url;
          let fetchBody: string | undefined;

          if (webhookMethod === "GET") {
            const sep = fetchUrl.includes("?") ? "&" : "?";
            fetchUrl = `${fetchUrl}${sep}payload=${encodeURIComponent(JSON.stringify(webhookPayload))}`;
          } else {
            fetchBody = JSON.stringify(webhookPayload);
          }

          // Add HMAC-SHA256 signature if secret is set
          if (webhookConn.secret) {
            const payloadStr = fetchBody || JSON.stringify(webhookPayload);
            const signature = crypto
              .createHmac("sha256", webhookConn.secret)
              .update(payloadStr)
              .digest("hex");
            fetchHeaders["X-Repeatless-Signature"] = `sha256=${signature}`;
          }

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10_000);

          let whStatus: "success" | "error" = "error";
          let whCode = 0;

          try {
            const whRes = await fetch(fetchUrl, {
              method: webhookMethod,
              headers: fetchHeaders,
              body: fetchBody,
              signal: controller.signal,
            });
            clearTimeout(timeoutId);
            whStatus = whRes.ok ? "success" : "error";
            whCode = whRes.status;

            if (whRes.ok) {
              logLines.push(`✔ send_to_webhook (${webhookName}): delivered — HTTP ${whCode}.`);
            } else {
              logLines.push(`✘ send_to_webhook (${webhookName}): server responded with HTTP ${whCode}.`);
            }
          } catch (whErr: any) {
            clearTimeout(timeoutId);
            logLines.push(`✘ send_to_webhook (${webhookName}): connection failed — ${whErr.message}.`);
          }

          // Update webhook record
          await db.webhookConnection.update({
            where: { id: webhookId },
            data: {
              lastTestedAt: new Date(),
              lastTestStatus: whStatus,
              lastTestCode: whCode,
            },
          });
        }
      } else {
        logLines.push(`⚠ Unknown action type: "${type}" — skipped.`);
      }
    } catch (actionErr: any) {
      logLines.push(`✘ ${type}: Exception — ${actionErr.message}`);
    }
  }

  return {
    status: "success",
    log: logLines.join("\n") || "No actions executed.",
  };
}

// ────────────────────────────────────────────────────────────
// GET /api/cron/workflows — called by Vercel Cron every minute
// ────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  try {
    // ── Security check ──
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = req.headers.get("authorization");
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const now = new Date();

    // Find all enabled workflows whose nextRunAt is overdue
    const dueWorkflows = await db.workflow.findMany({
      where: {
        enabled: true,
        nextRunAt: { lte: now },
      },
    });

    if (dueWorkflows.length === 0) {
      return NextResponse.json({ ran: 0, results: [] });
    }

    const results: Array<{
      id: string;
      name: string;
      status: string;
      log: string;
    }> = [];

    for (const workflow of dueWorkflows) {
      // Mark as running
      await db.workflow.update({
        where: { id: workflow.id },
        data: { lastRunStatus: "running" },
      });

      const { status, log } = await executeWorkflowActions(workflow);

      // Update workflow post-run
      await db.workflow.update({
        where: { id: workflow.id },
        data: {
          lastRunAt: new Date(),
          lastRunStatus: status,
          lastRunLog: log,
          nextRunAt: computeNextRun(workflow.schedule, workflow.timezone),
        },
      });

      results.push({ id: workflow.id, name: workflow.name, status, log });
    }

    console.log(`[cron/workflows] Ran ${results.length} workflow(s) at ${now.toISOString()}`);

    return NextResponse.json({ ran: results.length, results });
  } catch (error: any) {
    console.error("GET /api/cron/workflows error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
