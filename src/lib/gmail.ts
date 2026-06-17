import { google } from "googleapis";
import { db } from "./db";
import { summarizeEmail } from "./gemini";
import crypto from "crypto";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/auth/callback/google`
);

export async function getGmailClient(userId: string) {
  const account = await db.account.findFirst({
    where: { userId, provider: "google" },
  });

  if (!account || !account.access_token) {
    throw new Error(`No Google account credentials found for user: ${userId}`);
  }

  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  // Automatically save refreshed tokens
  oauth2Client.on("tokens", async (tokens) => {
    const updateData: any = {};
    if (tokens.access_token) updateData.access_token = tokens.access_token;
    if (tokens.expiry_date) updateData.expires_at = Math.floor(tokens.expiry_date / 1000);
    if (tokens.refresh_token) updateData.refresh_token = tokens.refresh_token;

    try {
      await db.account.update({
        where: { id: account.id },
        data: updateData,
      });
      console.log(`Refreshed and stored Google OAuth tokens for user: ${userId}`);
    } catch (err) {
      console.error("Failed to update refreshed tokens in database:", err);
    }
  });

  return google.gmail({ version: "v1", auth: oauth2Client });
}

// Extract email text body from MIME structure
function getEmailBody(payload: any): string {
  if (!payload) return "";

  if (payload.body && payload.body.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }

  if (payload.parts) {
    return getPartsBody(payload.parts);
  }

  return "";
}

function getPartsBody(parts: any[]): string {
  const plainPart = parts.find((part) => part.mimeType === "text/plain");
  if (plainPart && plainPart.body && plainPart.body.data) {
    return Buffer.from(plainPart.body.data, "base64").toString("utf-8");
  }

  const htmlPart = parts.find((part) => part.mimeType === "text/html");
  if (htmlPart && htmlPart.body && htmlPart.body.data) {
    const rawHtml = Buffer.from(htmlPart.body.data, "base64").toString("utf-8");
    // Simple tag strip for fallback
    return rawHtml
      .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, "")
      .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  for (const part of parts) {
    if (part.parts) {
      const body = getPartsBody(part.parts);
      if (body) return body;
    }
  }

  return "";
}

// Deduplication Signature Helpers
function normalizeSender(sender: string): string {
  const emailRegex = /<([^>]+)>/;
  const match = sender.match(emailRegex);
  const email = match && match[1] ? match[1] : sender;
  return email.toLowerCase().trim();
}

function normalizeSubject(subject: string): string {
  return subject
    .toLowerCase()
    .replace(/\b(re|fwd|fw|reply):\s*/gi, "") // strip prefixes
    .replace(/[^a-zA-Z\s]/g, "") // strip numbers & special characters
    .replace(/\s+/g, " ") // normalize spacing
    .trim();
}

function getYearWeekString(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, "0")}`;
}

export function generateDedupHash(sender: string, subject: string, date: Date): string {
  const normSender = normalizeSender(sender);
  const normSubject = normalizeSubject(subject);
  const weekString = getYearWeekString(date);

  const signature = `${normSender}|${normSubject}|${weekString}`;
  return crypto.createHash("md5").update(signature).digest("hex");
}

export async function syncEmails(userId: string, limit: number = 20) {
  const gmail = await getGmailClient(userId);
  
  // Ensure user preference exists
  let preference = await db.userPreference.findUnique({
    where: { userId }
  });
  if (!preference) {
    preference = await db.userPreference.create({
      data: { userId }
    });
  }

  console.log(`Starting email sync for user ${userId}...`);

  // Fetch list of recent messages
  const response = await gmail.users.messages.list({
    userId: "me",
    maxResults: limit,
    q: "-category:chats", // avoid chat histories
  });

  const messages = response.data.messages || [];
  let newEmailsCount = 0;
  let skippedDuplicates = 0;

  for (const message of messages) {
    if (!message.id) continue;

    // 1. Idempotency Check: Check if message already exists
    const existingEmail = await db.email.findUnique({
      where: { id: message.id },
    });
    if (existingEmail) continue;

    // 2. Fetch full email payload
    const emailData = await gmail.users.messages.get({
      userId: "me",
      id: message.id,
      format: "full",
    });

    const headers = emailData.data.payload?.headers || [];
    const subject = headers.find((h) => h.name?.toLowerCase() === "subject")?.value || "(No Subject)";
    const sender = headers.find((h) => h.name?.toLowerCase() === "from")?.value || "Unknown";
    const receiver = headers.find((h) => h.name?.toLowerCase() === "to")?.value || "";
    const dateStr = headers.find((h) => h.name?.toLowerCase() === "date")?.value || "";
    const date = dateStr ? new Date(dateStr) : new Date();
    const snippet = emailData.data.snippet || "";
    
    // Parse labels
    const labels = emailData.data.labelIds?.join(",") || "";
    
    // Extract full body content
    const bodyContent = getEmailBody(emailData.data.payload) || snippet;
    
    // 3. Deduplication Check
    const dedupHash = generateDedupHash(sender, subject, date);
    
    // Check if another email with this hash exists in the user's DB
    const duplicateEmail = await db.email.findFirst({
      where: {
        userId,
        dedupHash,
        isDuplicate: false,
      },
    });

    let isDuplicate = false;
    if (duplicateEmail) {
      isDuplicate = true;
      skippedDuplicates++;
    }

    // Save Email entry
    const email = await db.email.create({
      data: {
        id: message.id,
        threadId: emailData.data.threadId || message.id,
        userId,
        subject,
        sender,
        receiver,
        date,
        bodySnippet: snippet,
        bodyContent,
        labels,
        isDuplicate,
        dedupHash,
      },
    });

    // 4. Summarization step (only if not a duplicate)
    if (!isDuplicate) {
      const summary = await summarizeEmail(
        subject,
        sender,
        bodyContent,
        preference.summaryModel
      );

      await db.emailSummary.create({
        data: {
          emailId: email.id,
          shortSummary: summary.shortSummary,
          detailedSummary: summary.detailedSummary,
          actionItems: JSON.stringify(summary.actionItems),
          category: summary.category,
          importanceScore: summary.importanceScore,
        },
      });
      newEmailsCount++;
    } else {
      // Create a dummy summary for duplicates so schema relations don't break
      await db.emailSummary.create({
        data: {
          emailId: email.id,
          shortSummary: `[Duplicate Newsletter] Sender sent similar content this week.`,
          detailedSummary: `This email was identified as a duplicate newsletter from ${sender} under subject "${subject}". Summarization skipped.`,
          actionItems: JSON.stringify([]),
          category: "Updates",
          importanceScore: 1,
        },
      });
    }
  }

  // Update Sync State
  await db.syncState.upsert({
    where: { userId },
    update: { lastSyncAt: new Date() },
    create: { userId, lastSyncAt: new Date() },
  });

  return {
    processed: messages.length,
    newEmails: newEmailsCount,
    duplicatesSkipped: skippedDuplicates,
  };
}

export async function sendGmailReply(
  userId: string,
  threadId: string,
  replyText: string,
  recipient: string,
  subject: string
) {
  const gmail = await getGmailClient(userId);

  // Draft MIME message
  const rawMessage = [
    `To: ${recipient}`,
    `Subject: ${subject.startsWith("Re:") ? subject : "Re: " + subject}`,
    `In-Reply-To: ${threadId}`,
    `References: ${threadId}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    replyText,
  ].join("\n");

  const encodedMessage = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedMessage,
      threadId: threadId,
    },
  });

  return res.data;
}
