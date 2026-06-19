import { google } from "googleapis";
import { db } from "./db";

// Dynamically resolve NEXTAUTH_URL on Vercel deployments to prevent redirect URI mismatch
if (process.env.VERCEL_URL && (!process.env.NEXTAUTH_URL || process.env.NEXTAUTH_URL.includes("localhost"))) {
  process.env.NEXTAUTH_URL = `https://${process.env.VERCEL_URL}`;
}

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/auth/callback/google`
);

export async function getCalendarClient(userId: string) {
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
    const updateData: { access_token?: string | null; expires_at?: number | null; refresh_token?: string | null } = {};
    if (tokens.access_token) updateData.access_token = tokens.access_token;
    if (tokens.expiry_date) updateData.expires_at = Math.floor(tokens.expiry_date / 1000);
    if (tokens.refresh_token) updateData.refresh_token = tokens.refresh_token;

    try {
      await db.account.update({
        where: { id: account.id },
        data: updateData,
      });
      console.log(`Refreshed and stored Google OAuth Calendar tokens for user: ${userId}`);
    } catch (err) {
      console.error("Failed to update refreshed calendar tokens in database:", err);
    }
  });

  return google.calendar({ version: "v3", auth: oauth2Client });
}
