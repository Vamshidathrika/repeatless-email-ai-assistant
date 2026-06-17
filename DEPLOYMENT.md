# Deployment Guide

This guide details how to deploy the AI Gmail Intelligence platform to a production environment. Since the application is built using Next.js (App Router) with Prisma (PostgreSQL) and NextAuth, the easiest and most recommended hosting provider is **Vercel**. You can also deploy to **Firebase App Hosting**.

---

## Prerequisites

Before deploying, ensure you have:
1. A **GitHub repository** containing your pushed code.
2. A **PostgreSQL database** connection URL (e.g., from [Supabase](https://supabase.com/) or [Neon](https://neon.tech/)).
3. An active **Gemini API Key** from [Google AI Studio](https://aistudio.google.com/).
4. A **Google Cloud Console Project** with the Gmail API enabled.

---

## 1. Google OAuth Setup (Production)

You must add your production redirect callback URI to Google Cloud Console so the OAuth login flow succeeds on your live domain:

1. Go to the [Google Cloud Console Credentials Screen](https://console.cloud.google.com/apis/credentials).
2. Select your project.
3. Edit your OAuth 2.0 Client ID (under Web Applications).
4. Under **Authorized redirect URIs**, add your production URL callback:
   - For Vercel: `https://your-app-name.vercel.app/api/auth/callback/google`
   - For Firebase: `https://your-app-name.web.app/api/auth/callback/google`
5. Save changes. (Note: Google may take a few minutes to propagate the new redirect URI).

---

## 2. Deploying to Vercel (Recommended)

Vercel provides native, serverless optimization for Next.js App Router projects.

### Step 1: Import Project
1. Log in to [Vercel](https://vercel.com/) and click **Add New** -> **Project**.
2. Select and import your private GitHub repository.

### Step 2: Configure Environment Variables
Under the **Environment Variables** accordion, add the following variables:

| Variable Name | Description / Value |
| :--- | :--- |
| `DATABASE_URL` | Your production PostgreSQL connection string. *Note: If using connection pooling (e.g. Supabase Session mode on port 5432 or 6543), append `?pgbouncer=true` to prevent Prisma from running out of connections in serverless functions.* |
| `NEXTAUTH_SECRET` | A secure random string used to sign cookies. You can generate one locally by running `openssl rand -base64 32` in your terminal. |
| `NEXTAUTH_URL` | Your production deployment URL (e.g., `https://your-app-name.vercel.app`). |
| `GOOGLE_CLIENT_ID` | Your Google Cloud OAuth Client ID. |
| `GOOGLE_CLIENT_SECRET` | Your Google Cloud OAuth Client Secret. |
| `GEMINI_API_KEY` | Your Gemini API Key from Google AI Studio. |

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
3. Follow the interactive prompts to link your GitHub repository, choose your region, and name your backend. This configures a deployment pipeline that triggers on every git push to your main branch.

### Step 3: Environment Variables
1. Navigate to the **Firebase Console** -> **App Hosting** -> **Select your Backend** -> **Settings**.
2. Add your environment variables (`DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GEMINI_API_KEY`).
3. App Hosting will inject these into the container build securely.

---

## 4. Initializing Production Database

To make sure your live PostgreSQL instance has the necessary database schema, run the Prisma push command pointing to your production database URL (you can run this locally by swapping your `.env` connection string momentarily, or running the CLI flag):

```bash
DATABASE_URL="your_production_postgresql_url" npx prisma db push
```

This updates your database tables without wiping existing records.
