# Repeatless — Deployment Guide

**Repeatless** is an AI-powered Gmail intelligence platform that connects to your inbox via Google OAuth 2.0, syncs and deduplicates emails into a PostgreSQL database, and generates intelligent summaries, action items, and draft replies using Google Gemini. This guide walks you through deploying Repeatless to a production environment using either **Vercel** (recommended) or **Firebase App Hosting**.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Google OAuth Setup (Production)](#1-google-oauth-setup-production)
- [Deploying to Vercel (Recommended)](#2-deploying-to-vercel-recommended)
- [Deploying to Firebase App Hosting](#3-deploying-to-firebase-app-hosting)
- [Initializing Production Database](#4-initializing-production-database)
- [Post-Deployment Verification](#5-post-deployment-verification)
- [Environment Variable Reference](#environment-variable-reference)
- [Troubleshooting](#troubleshooting)
- [Scaling Considerations](#scaling-considerations)
- [Updating the Application](#updating-the-application)

---

## Prerequisites

Before deploying, ensure you have:

1. A **GitHub repository** containing your pushed code.
2. A **PostgreSQL database** connection URL (e.g., from [Supabase](https://supabase.com/) or [Neon](https://neon.tech/)).
3. An active **Gemini API Key** from [Google AI Studio](https://aistudio.google.com/).
4. A **Google Cloud Console Project** with the Gmail API enabled and OAuth consent screen configured.

---

## 1. Google OAuth Setup (Production)

You must add your production redirect callback URI to Google Cloud Console so the OAuth login flow succeeds on your live domain:

1. Go to the [Google Cloud Console Credentials Screen](https://console.cloud.google.com/apis/credentials).
2. Select your project.
3. Edit your OAuth 2.0 Client ID (under Web Applications).
4. Under **Authorized redirect URIs**, add your production URL callback:
   - For Vercel: `https://your-app-name.vercel.app/api/auth/callback/google`
   - For Firebase: `https://your-app-name.web.app/api/auth/callback/google`
5. Save changes.

> [!NOTE]
> Google may take a few minutes to propagate the new redirect URI. Wait at least 5 minutes before testing the OAuth flow after saving changes.

---

## 2. Deploying to Vercel (Recommended)

Vercel provides native, serverless optimization for Next.js App Router projects.

### Step 1: Import Project

1. Log in to [Vercel](https://vercel.com/) and click **Add New** → **Project**.
2. Select and import your private GitHub repository.

### Step 2: Configure Environment Variables

Under the **Environment Variables** accordion, add the following variables:

| Variable Name          | Description / Value                                                                                                                                                                                                                  |
| :--------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`         | Your production PostgreSQL connection string. *Note: If using connection pooling (e.g. Supabase Session mode on port 5432 or 6543), append `?pgbouncer=true` to prevent Prisma from running out of connections in serverless functions.* |
| `NEXTAUTH_SECRET`      | A secure random string used to sign cookies. Generate one by running `openssl rand -base64 32` in your terminal.                                                                                                                     |
| `NEXTAUTH_URL`         | Your production deployment URL (e.g., `https://your-app-name.vercel.app`).                                                                                                                                                          |
| `GOOGLE_CLIENT_ID`     | Your Google Cloud OAuth Client ID.                                                                                                                                                                                                   |
| `GOOGLE_CLIENT_SECRET` | Your Google Cloud OAuth Client Secret.                                                                                                                                                                                               |
| `GEMINI_API_KEY`       | Your Gemini API Key from Google AI Studio.                                                                                                                                                                                           |

### Step 3: Deploy

1. Click **Deploy**. Vercel will automatically compile, build, and deploy your serverless endpoints.
2. Once complete, click the deployment link to access your live application!

---

## 3. Deploying to Firebase App Hosting

Firebase App Hosting is designed to automatically build and host Next.js SSR apps on Google Cloud Run.

### Step 1: Install Firebase CLI

If not already installed:

```bash
npm install -g firebase-tools
```

### Step 2: Log In and Initialize

1. Login to your account:
   ```bash
   firebase login
   ```
2. Initialize App Hosting in the root of your project:
   ```bash
   firebase apphosting:backends:create --project <your-firebase-project-id>
   ```
3. Follow the interactive prompts to link your GitHub repository, choose your region, and name your backend. This configures a deployment pipeline that triggers on every `git push` to your main branch.

### Step 3: Environment Variables

1. Navigate to the **Firebase Console** → **App Hosting** → **Select your Backend** → **Settings**.
2. Add your environment variables (`DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GEMINI_API_KEY`).
3. App Hosting will inject these into the container build securely.

---

## 4. Initializing Production Database

To make sure your live PostgreSQL instance has the necessary database schema, run the Prisma push command pointing to your production database URL. You can run this locally by temporarily using your production connection string:

```bash
DATABASE_URL="your_production_postgresql_url" npx prisma db push
```

This updates your database tables without wiping existing records.

> [!IMPORTANT]
> Always verify the `DATABASE_URL` is pointing to the correct production database before running this command. Running `prisma db push` against the wrong database could alter an unintended schema.

---

## 5. Post-Deployment Verification

After deploying, walk through the following checklist to confirm Repeatless is fully operational:

### Connectivity Checks

| Step | Action                                             | Expected Result                                                                 |
| :--: | :------------------------------------------------- | :------------------------------------------------------------------------------ |
|  1   | Open the production URL in a browser               | The Repeatless login page loads without errors                                  |
|  2   | Click **Connect Google Account**                   | Google OAuth consent screen appears with correct scopes                         |
|  3   | Complete the OAuth flow and grant permissions       | Redirected back to the dashboard; session is active                             |
|  4   | Click **Sync Inbox** in the sidebar                | Emails are fetched, processed, and displayed; status updates in real-time       |
|  5   | Click an email card to view the AI summary         | Summary, action items, importance score, and reply suggestions are rendered     |
|  6   | Compose a reply using an instruction chip          | Gemini generates a contextual draft reply                                       |
|  7   | Open the **Gemini Copilot** chat panel             | Chat responds to natural language queries (e.g., *"Summarize my week"*)        |
|  8   | Run the **Clean Inbox** feature from the sidebar   | Duplicate newsletters are identified and moved to Trash                         |

### Health Indicators

- **No console errors** in the browser DevTools.
- **API routes** return `200 OK` — test with `curl https://your-domain.com/api/emails`.
- **Database connection** is stable — the dashboard loads cached emails on refresh without re-syncing.

---

## Environment Variable Reference

The complete set of environment variables required by Repeatless:

| Variable               | Required | Description                                                                                                  | Example Value                                                  |
| :--------------------- | :------: | :----------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------- |
| `DATABASE_URL`         |    ✅     | PostgreSQL connection string. URL-encode any `@` in the password as `%40`. Append `?pgbouncer=true` if using connection pooling. | `postgresql://user:pass@host:5432/db`                          |
| `NEXTAUTH_URL`         |    ✅     | The canonical, publicly accessible URL of your deployment.                                                   | `https://repeatless.vercel.app`                                |
| `NEXTAUTH_SECRET`      |    ✅     | A cryptographically random string for signing session cookies. Generate with `openssl rand -base64 32`.       | `k8Jd3mPz...` (32+ characters)                                |
| `GOOGLE_CLIENT_ID`     |    ✅     | OAuth 2.0 Client ID from the Google Cloud Console (Web Application type).                                    | `123456789.apps.googleusercontent.com`                         |
| `GOOGLE_CLIENT_SECRET` |    ✅     | OAuth 2.0 Client Secret from the Google Cloud Console.                                                       | `GOCSPX-xxxxxxxxxxxx`                                          |
| `GEMINI_API_KEY`       |    ✅     | Google Gemini API key obtained from [Google AI Studio](https://aistudio.google.com/).                        | `AIzaSyxxxxxxxxxxxx`                                           |

> [!TIP]
> Store sensitive values using your platform's secrets manager (Vercel Environment Variables, Firebase Secret Manager) rather than committing them to version control. Never include secrets in `.env` files pushed to GitHub.

---

## Troubleshooting

### OAuth Redirect Mismatch Errors

**Symptom**: `redirect_uri_mismatch` error during Google sign-in.

**Cause**: The redirect URI configured in Google Cloud Console doesn't match your deployment URL.

**Fix**:
1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).
2. Verify the **Authorized redirect URI** matches exactly:
   ```
   https://<your-production-domain>/api/auth/callback/google
   ```
3. Ensure `NEXTAUTH_URL` matches your actual domain (no trailing slash).
4. Wait 5 minutes after saving for changes to propagate.

---

### Database Connection Issues

**Symptom**: `Can't reach database server` or `too many connections` errors.

**Cause**: SSL requirements or serverless connection exhaustion.

**Fix**:

| Problem                       | Solution                                                                                                                     |
| :---------------------------- | :--------------------------------------------------------------------------------------------------------------------------- |
| SSL connection required       | Append `?sslmode=require` to your `DATABASE_URL`.                                                                            |
| Too many connections           | Use connection pooling (PgBouncer). Append `?pgbouncer=true` to the connection string. Use the pooler port (e.g., `6543`).  |
| Connection timeout             | Ensure your database provider allows connections from your hosting platform's IP ranges (Vercel uses dynamic IPs).           |

---

### Gemini API Rate Limiting

**Symptom**: `429 Too Many Requests`, `RESOURCE_EXHAUSTED`, or `503 UNAVAILABLE` errors during email summarization.

**Cause**: Google Gemini API free-tier quota exceeded.

**Built-in mitigation**: Repeatless includes a resilient retry mechanism with **4 retries and exponential backoff** (starting at 1 second, multiplied by 2.5× per attempt). The system automatically handles:
- `429` rate limit errors
- `503` service unavailable errors
- `RESOURCE_EXHAUSTED` quota errors

**Additional steps if persistent**:
1. Check your [Gemini API quota dashboard](https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/quotas) for current usage.
2. Reduce the sync batch size by syncing fewer emails at a time.
3. Consider upgrading to a paid Gemini API tier for higher rate limits.

---

### Gmail API Insufficient Permissions

**Symptom**: `403 Forbidden` or `Insufficient Permission` errors when syncing, sending, or trashing emails.

**Cause**: The OAuth consent screen or token doesn't include the required Gmail scopes.

**Fix**:
1. Verify the OAuth consent screen includes all required scopes:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/gmail.send`
2. Revoke the existing token: the user should go to [Google Account Permissions](https://myaccount.google.com/permissions), remove Repeatless, and sign in again to re-grant scopes.
3. Ensure the Gmail API is **enabled** in your Google Cloud project under APIs & Services.

---

### Token Refresh Failures

**Symptom**: Users are signed in but API calls fail with `invalid_grant` or `Token has been expired or revoked`.

**Cause**: The stored OAuth refresh token has been invalidated.

**Common reasons & fixes**:

| Reason                                       | Fix                                                                                                  |
| :------------------------------------------- | :--------------------------------------------------------------------------------------------------- |
| User revoked access in Google Account settings | User must sign out and re-authenticate through the Repeatless OAuth flow.                            |
| Refresh token expired (6-month inactivity)    | User must re-authenticate. No server-side fix.                                                       |
| App is in "Testing" mode (max 7-day tokens)   | Publish your OAuth consent screen to **Production** in Google Cloud Console for long-lived tokens.   |
| `GOOGLE_CLIENT_SECRET` was rotated            | Update the `GOOGLE_CLIENT_SECRET` environment variable and redeploy. Existing tokens will be invalid. |

> [!WARNING]
> If your OAuth consent screen is still in **Testing** mode, Google issues refresh tokens that expire after 7 days. Users will need to re-authenticate weekly. Publish to **Production** to resolve this.

---

## Scaling Considerations

### Serverless Cold Starts

Repeatless API routes run as serverless functions on Vercel (or Cloud Run on Firebase). The first request after a period of inactivity may take 1–3 seconds longer due to a cold start. To minimize impact:

- Keep function bundles lean by avoiding unnecessary dependencies.
- On Vercel Pro/Enterprise plans, use [Fluid Compute](https://vercel.com/docs/functions/fluid-compute) to reduce cold-start latency.
- For Firebase App Hosting, configure a **minimum instance count** of `1` to keep at least one warm container.

### Database Connection Pooling

Serverless functions spin up many short-lived connections, which can exhaust PostgreSQL's connection limit. Use a connection pooler to mitigate this:

```
# Example: Supabase pooler URL on port 6543
DATABASE_URL="postgresql://user:pass@db.xxxxx.supabase.co:6543/postgres?pgbouncer=true"
```

| Provider  | Pooling Method         | Config Change                                  |
| :-------- | :--------------------- | :--------------------------------------------- |
| Supabase  | Built-in PgBouncer     | Use port `6543` and append `?pgbouncer=true`   |
| Neon      | Built-in connection pooler | Use the pooled connection string from the dashboard |
| Self-hosted | Install PgBouncer     | Point `DATABASE_URL` at the PgBouncer endpoint |

### Gemini API Rate Limits

The Gemini free tier enforces per-minute request quotas. Repeatless mitigates this with built-in retry logic:

```
Retry Strategy: 4 retries, exponential backoff
  Attempt 1 → wait 1.0s
  Attempt 2 → wait 2.5s
  Attempt 3 → wait 6.25s
  Attempt 4 → wait 15.6s
```

If you encounter persistent `429` errors at scale:
- Upgrade to a paid Gemini API tier.
- Implement request queuing at the application level.
- Reduce the number of emails synced per batch.

### Gmail API Quotas

The Gmail API enforces daily usage quotas. Key limits to be aware of:

| Quota                          | Free Tier Limit             |
| :----------------------------- | :-------------------------- |
| Queries per day                | 1,000,000,000 quota units   |
| Per-user rate limit            | 250 quota units / second    |
| `messages.list`                | 5 units per call            |
| `messages.get`                 | 5 units per call            |
| `messages.send`                | 100 units per call          |
| `messages.trash`               | 50 units per call           |

For typical single-user usage, these limits are more than sufficient. If operating at higher scale, monitor usage in the [Google Cloud Console API Dashboard](https://console.cloud.google.com/apis/dashboard).

---

## Updating the Application

Both Vercel and Firebase App Hosting support **Git-based continuous deployment**. Pushing changes to your linked branch automatically triggers a new build and deploy.

### Vercel

```bash
# Make changes locally, then push to trigger a deploy
git add .
git commit -m "feat: your update description"
git push origin main
```

Vercel will:
1. Detect the push via the GitHub integration.
2. Run the Next.js build (`next build`).
3. Deploy the new version with zero downtime.
4. Provide a unique preview URL for every commit on non-production branches.

> [!TIP]
> Use Vercel's **Preview Deployments** by pushing to a non-`main` branch. Each pull request gets its own isolated preview URL for testing before merging to production.

### Firebase App Hosting

```bash
git add .
git commit -m "feat: your update description"
git push origin main
```

Firebase App Hosting will:
1. Detect the push via the connected GitHub repository.
2. Build the Next.js application in a Cloud Build pipeline.
3. Deploy the new container to Cloud Run with a rolling update.

### Database Migrations

If your update includes Prisma schema changes, run the migration **before** the new code goes live:

```bash
DATABASE_URL="your_production_postgresql_url" npx prisma db push
```

> [!CAUTION]
> Always back up your production database before running schema changes. While `prisma db push` is non-destructive for additive changes (new tables, new columns), removing or renaming fields can result in data loss.

---

*Last updated: June 2026*
