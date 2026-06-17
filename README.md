# AI-Powered Gmail Intelligence Platform

A personal, secure, and lightning-fast AI Gmail workspace built for technical assessment. This application connects directly to a user's Gmail using Google OAuth 2.0, processes and filters emails into a PostgreSQL database, and orchestrates Gemini 3.5 Flash summaries via a bespoke, glassmorphic React dashboard.

---

## Key Features

1. **Secure Gmail OAuth 2.0 Integration**: Authenticates directly with Google APIs without ever requesting or storing passwords. Seamlessly handles automatic token refreshing.
2. **AI-Powered Email Summarization**: Translates long threads into one-sentence summaries, detailed context points, and urgency ratings (1-10) using Gemini 3.5 Flash.
3. **Smart Categorization & Action Item Extraction**: Automatically routes incoming mail to categories (*Important, Promotions, Finance, Social, Updates*) and creates interactive, actionable checklists.
4. **Thread-Aware AI Compose & Reply**: Drafts contextual email replies based on thread history and user-specific guidelines, with sending capabilities built directly into the UI.
5. **Interactive AI Chat Assistant**: An integrated chat interface that translates natural language queries (e.g., *"Summarize my week"* or *"Show important unread mails"*) into database queries to compile relevant context and generate conversational answers.
6. **Newsletter Deduplication (Bonus)**: Detects promotional newsletters and calculates a deterministic weekly signature hash to skip repetitive, costly LLM calls, keeping the summary feed and AI context clean.
7. **Storage Saver Agent (Cleanup)**: An automated cleaner that moves duplicate newsletters and promotional emails to the Gmail Trash folder to free up space on your Google account.

---

## Architecture & Data Flow

The system follows a decoupled single-user architecture:
- **Frontend**: Next.js App Router with Client Components, leveraging standard Vanilla CSS & styled-jsx for a premium, high-fidelity dark-mode interface.
- **Backend / Orchestration**: Next.js API Routes act as the orchestration layer (Gmail API synchronization, secure OAuth credential handling, and Gemini prompt engineering).
- **Database**: PostgreSQL (managed via Prisma ORM) for robust query storage and schema structure.

For a detailed design document, see [ARCHITECTURE.md](file:///Users/nani/Downloads/repeatless/ARCHITECTURE.md).

---

## Getting Started

### Prerequisites

1. **Google Cloud Project**:
   - Create a project in the [Google Cloud Console](https://console.cloud.google.com/).
   - Enable the **Gmail API** under APIs & Services.
   - Configure the OAuth Consent Screen (add test users, request scopes: `openid`, `email`, `profile`, `https://www.googleapis.com/auth/gmail.readonly`, `https://www.googleapis.com/auth/gmail.modify`, `https://www.googleapis.com/auth/gmail.send`).
   - Create **OAuth 2.0 Client Credentials** (Web Application) with redirect URI: `http://localhost:3000/api/auth/callback/google`.
2. **PostgreSQL Database**:
   - A hosted PostgreSQL instance (e.g., [Supabase](https://supabase.com/)).
3. **Gemini API Key**:
   - Obtain an API key from [Google AI Studio](https://aistudio.google.com/).

### Local Setup

1. **Clone and Install Dependencies**:
   ```bash
   cd repeatless
   npm install
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and fill in your keys:
   ```bash
   cp .env.example .env
   ```
   *Edit `.env` and fill in your PostgreSQL `DATABASE_URL` (ensure any `@` in your password is URL-encoded as `%40`), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GEMINI_API_KEY`, and generate a `NEXTAUTH_SECRET`.*

3. **Initialize Database Schema**:
   Push the Prisma schema to your PostgreSQL database:
   ```bash
   npx prisma db push
   ```

4. **Run the Development Server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Verification Guide

1. Navigate to the dashboard.
2. Click **Connect Google Account** and log in with your Google account. Confirm permissions when prompted.
3. Click **Sync Inbox** in the sidebar to trigger the sync of your recent emails. The status message will update you on processed emails, summaries generated, and deduplicated newsletters.
4. Click on an email card to view the AI-generated summary, interactive action item checklist, and the draft reply helper.
5. In the reply helper, click an instruction template chip (e.g. *"Politely Decline"*) or write custom instructions, then click **Compose** to generate a draft. Click **Send Reply** to send it directly via the Gmail API.
6. Open the **Gemini Copilot** chat on the right panel and query your inbox (e.g., *"Summarize my week"* or *"List urgent action items"*).
7. Under the sidebar filters, click **Clean Inbox** in the Storage Saver card, select your cleanup strategy, and click **Confirm & Run** to move duplicate circulars/promotions directly to your Gmail Trash.
