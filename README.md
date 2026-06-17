# AI-Powered Gmail Intelligence Platform

A personal, secure, and lightning-fast AI Gmail workspace built for technical assessment at **Repeatless** for the **AI Automation Executive** role. This application connects directly to a user's Gmail using Google OAuth 2.0, processes emails locally into an SQLite database, and orchestrates Gemini 3.5 Flash via a clean, premium React-based dashboard.

---

## Key Features

1. **Secure Gmail OAuth 2.0 Integration**: Authenticates directly with Google APIs without ever requesting or storing passwords. Seamlessly handles automatic token refreshing.
2. **AI-Powered Email Summarization**: Translates long threads into one-sentence summaries, detailed context points, and urgency ratings (1-10) using Gemini 3.5 Flash.
3. **Smart Categorization & Action Item Extraction**: Automatically routes incoming mail to categories (*Important, Promotions, Finance, Social, Updates*) and creates actionable checklists.
4. **Thread-Aware AI Compose & Reply**: Drafts contextual email replies based on thread history and user-specific guidelines, with sending capabilities built directly into the UI.
5. **Interactive AI Chat Assistant**: An integrated chat interface that translates natural language queries (e.g., *"Summarize my week"* or *"Do I have any emails from my manager?"*) into database queries to compile relevant context and generate conversational answers.
6. **Newsletter Deduplication (Bonus)**: Detects promotional newsletters and calculates a deterministic weekly signature hash to skip repetitive, costly LLM calls, keeping the summary feed and AI context clean.

---

## Architecture

The system follows a decoupled single-user architecture:
- **Frontend**: Next.js App Router with Client Components, leveraging standard Vanilla CSS & styled-jsx for a premium, high-fidelity dark-mode interface.
- **Backend / Orchestration**: Next.js API Routes act as the orchestration layer (Gmail API synchronization, secure OAuth credential handling, and Gemini prompt engineering).
- **Database**: SQLite (via Prisma ORM) for rapid local setup, ensuring zero-configuration deployment for assessment. Can be switched to PostgreSQL with one configuration change.

For a detailed design document, see [ARCHITECTURE.md](file:///Users/nani/Downloads/repeatless/ARCHITECTURE.md).

---

## Getting Started

### Prerequisites

1. **Google Cloud Project**:
   - Create a project in the [Google Cloud Console](https://console.cloud.google.com/).
   - Enable the **Gmail API** under APIs & Services.
   - Configure the OAuth Consent Screen (add test users, request scopes: `openid`, `email`, `profile`, `https://www.googleapis.com/auth/gmail.readonly`, `https://www.googleapis.com/auth/gmail.modify`, `https://www.googleapis.com/auth/gmail.send`).
   - Create **OAuth 2.0 Client Credentials** (Web Application) with redirect URI: `http://localhost:3000/api/auth/callback/google`.
2. **Gemini API Key**:
   - Obtain a free API key from [Google AI Studio](https://aistudio.google.com/).

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
   *Edit `.env` and fill in `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GEMINI_API_KEY`, and generate a `NEXTAUTH_SECRET`.*

3. **Initialize Database Schema**:
   Run Prisma migrations to create the local SQLite database (`dev.db`):
   ```bash
   npx prisma migrate dev --name init
   ```

4. **Run the Development Server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Verification Guide

1. Navigate to the dashboard.
2. Click **Connect with Gmail** and log in with your Google account. Confirm permissions when prompted.
3. Click **Sync Gmail** to trigger the background sync of the last 20 emails. The status message will update you on the processed emails, new summaries, and deduplicated newsletters.
4. Click on an email to view the AI-generated summary, action item checklist, and the draft reply helper.
5. Enter a prompt in the reply helper (e.g., *"Say I will review it tomorrow"*) and click **Generate** to draft a response. You can edit the text and click **Send Reply** to send it directly via the Gmail API.
6. Open the **AI Email Assistant** chat on the right panel and query your inbox (e.g., *"What unread important emails do I have?"* or *"Do I need to take action on any finance emails?"*).
