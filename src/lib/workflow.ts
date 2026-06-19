import { db } from "@/lib/db";
import crypto from "crypto";
import { syncEmails } from "@/lib/gmail";
import { summarizeThreadEmail } from "@/lib/gemini";

/**
 * Execute a workflow's action pipeline in-process (no session/cookie dependency).
 * Reused by both manual run API and cron runner API.
 */
export async function executeActions(
  workflow: {
    id: string;
    name: string;
    actions: string;
    schedule: string;
    timezone: string;
  },
  userId: string
): Promise<{ status: "success" | "error"; log: string }> {
  let actions: any[] = [];
  try {
    actions = JSON.parse(workflow.actions);
  } catch {
    return { status: "error", log: "Failed to parse workflow actions JSON." };
  }

  const logLines: string[] = [];

  for (const action of actions) {
    const type: string = action.type || action.action || "";

    try {
      if (type === "sync_emails") {
        // Sync the latest 20 emails
        const stats = await syncEmails(userId, 20);
        // Clear RAG query cache if new emails are found
        if (stats.newEmails > 0) {
          await db.queryCache.deleteMany({ where: { userId } });
        }
        logLines.push(
          `✔ sync_emails: synced ${stats.newEmails} new email(s) successfully, processed ${stats.processed} total.`
        );
      } else if (type === "summarize_emails") {
        // Fetch up to 10 unsummarized emails
        const pendingEmails = await db.email.findMany({
          where: { userId, summary: null },
          orderBy: { date: "desc" },
          take: 10,
        });

        if (pendingEmails.length === 0) {
          logLines.push(`✔ summarize_emails: no new unsummarized emails found.`);
        } else {
          // Fetch model preferences
          const preference = await db.userPreference.findUnique({
            where: { userId }
          });
          const summaryModel = preference?.summaryModel || "gemini-3.5-flash";

          let summarizedCount = 0;
          for (const email of pendingEmails) {
            try {
              // Fetch thread context
              const threadEmails = await db.email.findMany({
                where: { userId, threadId: email.threadId },
                orderBy: { date: "asc" }
              });
              let threadContextText = "";
              for (const msg of threadEmails) {
                if (msg.date.getTime() < email.date.getTime()) {
                  threadContextText += `From: ${msg.sender}\nDate: ${msg.date.toISOString()}\nSubject: ${msg.subject}\nContent:\n${msg.bodyContent.slice(0, 3000)}\n---\n`;
                }
              }

              // Run Gemini summarization
              const summary = await summarizeThreadEmail(
                email.subject,
                email.sender,
                email.bodyContent,
                threadContextText,
                summaryModel
              );

              // Store summary
              await db.emailSummary.upsert({
                where: { emailId: email.id },
                update: {
                  shortSummary: summary.shortSummary,
                  detailedSummary: summary.detailedSummary,
                  actionItems: JSON.stringify(summary.actionItems),
                  category: summary.category,
                  importanceScore: summary.importanceScore,
                  replySuggestions: JSON.stringify(summary.replySuggestions),
                },
                create: {
                  emailId: email.id,
                  shortSummary: summary.shortSummary,
                  detailedSummary: summary.detailedSummary,
                  actionItems: JSON.stringify(summary.actionItems),
                  category: summary.category,
                  importanceScore: summary.importanceScore,
                  replySuggestions: JSON.stringify(summary.replySuggestions),
                }
              });
              summarizedCount++;
            } catch (err: any) {
              console.error(`[Workflow Engine] Summarization failed for email ${email.id}:`, err.message);
            }
          }
          logLines.push(
            `✔ summarize_emails: summarized ${summarizedCount} of ${pendingEmails.length} pending email(s).`
          );
        }
      } else if (type === "send_to_slack") {
        // Post digest to Slack channel
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

          // Extract count from prior sync logs
          const syncEntry = logLines.find((l) => l.includes("sync_emails"));
          const newEmailsCount = syncEntry
            ? syncEntry.match(/synced (\d+) new/)?.[1] || "0"
            : "0";

          const summarizeEntry = logLines.find((l) => l.includes("summarize_emails"));
          const summarizedCount = summarizeEntry
            ? summarizeEntry.match(/summarized (\d+) of/)?.[1] || "0"
            : "0";

          const digestText = `*📧 Email Workflow Digest — ${workflow.name}*\n\n• *Synced*: ${newEmailsCount} new email(s)\n• *Summarized*: ${summarizedCount} email(s)\n• *Timestamp*: ${new Date().toLocaleTimeString()}\n\nStatus: Complete.`;

          if (isSandbox) {
            console.log(`[Sandbox] Would post to Slack #${channelName}: ${digestText}`);
            logLines.push(`✔ send_to_slack (sandbox): would post digest to #${channelName}.`);
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
        // Fire an external webhook
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
              console.warn(`send_to_webhook: failed to parse headers for webhook ${webhookId}, ignoring.`);
            }
          }

          // Extract count from prior sync logs
          const syncEntry = logLines.find((l) => l.includes("sync_emails"));
          const emailsFound = syncEntry
            ? parseInt(syncEntry.match(/synced (\d+) new/)?.[1] || "0", 10)
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
