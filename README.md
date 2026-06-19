<p align="center">
  <h1 align="center">✉️ Repeatless</h1>
  <p align="center"><strong>Your inbox, finally intelligent.</strong></p>
  <p align="center">
    An AI-powered Gmail workspace that summarizes emails, composes smart replies,<br/>
    deduplicates newsletters, and provides a conversational AI assistant — all in a premium, modern UI.
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.2.9-black?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Prisma-6.19.3-2D3748?style=for-the-badge&logo=prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/Gemini_AI-2.0_Flash_Lite-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Gemini AI" />
  <img src="https://img.shields.io/badge/Gmail_API-v173-EA4335?style=for-the-badge&logo=gmail&logoColor=white" alt="Gmail API" />
  <img src="https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge" alt="License" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.0-blue?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/React-19.2.4-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Auth-NextAuth_v4-purple?style=flat-square" alt="NextAuth" />
  <img src="https://img.shields.io/badge/DB-PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL" />
</p>

---

## 📑 Table of Contents

- [✨ Features](#-features)
- [🏗️ Architecture Overview](#️-architecture-overview)
- [🛠️ Tech Stack](#️-tech-stack)
- [📂 Project Structure](#-project-structure)
- [🚀 Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Google Cloud Setup](#google-cloud-setup)
  - [Environment Variables](#environment-variables)
  - [Database Setup](#database-setup)
  - [Run the App](#run-the-app)
- [🗄️ Database Schema](#️-database-schema)
- [📡 API Reference](#-api-reference)
- [✅ Verification Guide](#-verification-guide)
- [🌐 Deployment](#-deployment)
- [📄 License](#-license)

---

## ✨ Features

### 🔐 SaaS-Style Login Page

Premium split-layout authentication experience. The left panel features an animated gradient background with floating orbs, feature highlights, usage stats, and testimonials with staggered card animations. The right panel presents a clean Google OAuth flow with a prominent **"Connect Gmail Account"** CTA. Trust badges for **SOC 2**, **OAuth 2.0**, and **No email stored** build user confidence from the very first screen.

### 🔑 Secure Google OAuth 2.0

Full Gmail integration with granular scopes:

| Scope | Purpose |
|---|---|
| `openid` | OpenID Connect identity |
| `email`, `profile` | User information |
| `gmail.readonly` | Read email threads and messages |
| `gmail.modify` | Archive, star, trash, and label emails |
| `gmail.send` | Send emails and smart replies |

Automatic token refresh is persisted to the database, ensuring uninterrupted access. Sessions use a **JWT strategy** for stateless, edge-compatible authentication.

### 📥 Gmail Sync Pipeline

Thread-first synchronization architecture:

1. Fetches recent threads via the Gmail API
2. Processes each message within every thread
3. Extracts `text/plain` and `text/html` bodies
4. Parses `List-Unsubscribe` headers for newsletter management
5. Builds rolling thread context for downstream AI processing

### 🧠 AI Email Summarization

Powered by **Google Gemini 2.0 Flash Lite**, each email is summarized into a structured JSON output:

```json
{
  "shortSummary": "One-sentence overview of the email",
  "detailedSummary": "Multi-paragraph breakdown of the content",
  "actionItems": ["Review the attached contract", "Reply by Friday"],
  "category": "Work/Professional",
  "importanceScore": 8,
  "replySuggestions": ["Sounds good, I'll review it today.", "Can we push this to next week?"]
}
```

Uses **JSON schema enforcement** for reliable structured output. Implements **retry with exponential backoff** to gracefully handle Gemini API rate limits.

### 🏷️ Smart Categorization

AI-driven classification into six categories:

| Category | Examples |
|---|---|
| 📰 **Newsletters** | Substack, Medium Digest, marketing emails |
| 💼 **Job / Recruitment** | LinkedIn, recruiter outreach, job alerts |
| 💰 **Finance** | Bank statements, invoices, payment receipts |
| 🔔 **Notifications** | GitHub, Slack, app alerts, shipping updates |
| 👤 **Personal** | Friends, family, personal correspondence |
| 🏢 **Work / Professional** | Colleagues, clients, meeting invites |

Categories are fully **user-configurable** through the `UserPreference` model.

### 🔁 Newsletter Deduplication

Intelligent duplicate detection using an **MD5 hash** of:

```
MD5( normalized(sender) + normalized(subject) + year-week )
```

> [!IMPORTANT]
> Deduplication only applies to **single-message threads** — active conversations are never marked as duplicates, preserving the integrity of ongoing discussions.

### 📬 Thread-Grouped Inbox

- Emails grouped by `threadId` and sorted by latest message date
- **Thread accordion** with expand/collapse for multi-message threads
- Per-email and per-thread actions: ⭐ Star, 📦 Archive, 🗑️ Trash
- Category and search filters for fast navigation

### ✍️ AI Smart Replies

1. User types a natural-language instruction (e.g., *"Politely decline and suggest next quarter"*)
2. Gemini drafts a **context-aware reply** with subject line and body
3. Supports **Reply** and **Forward** modes
4. CC/BCC recipient fields
5. Sends directly via Gmail API with proper **RFC 2822 threading headers** (`In-Reply-To`, `References`)

### 🤖 Gemini Copilot Chat

A conversational AI assistant that understands your entire inbox:

- **Thread-first RAG**: retrieves recent emails + keyword matches + category matches, groups by thread, and builds structured context
- **Conversational history** maintained across messages
- **Specialized newsletter digest mode** for summarizing subscription content
- Example queries: *"Summarize my week"*, *"What action items do I have?"*, *"Find emails about the Q3 budget"*

### 📊 Eisenhower Priority Matrix

Four-quadrant urgency dashboard based on AI importance scores:

```
┌─────────────────────┬─────────────────────┐
│  🔴 DO FIRST        │  🟡 SCHEDULE        │
│  Score ≥ 7          │  Score 5–6          │
│  Urgent & Important │  Important, Not     │
│                     │  Urgent             │
├─────────────────────┼─────────────────────┤
│  🔵 DELEGATE        │  ⚪ ELIMINATE        │
│  Score 3–4          │  Score < 3 or       │
│  Urgent, Not        │  Duplicate          │
│  Important          │                     │
└─────────────────────┴─────────────────────┘
```

### 📋 Daily Brief

AI-generated daily briefing aggregated from **all action items** extracted across your synced emails. Presented as an interactive checklist with checkboxes for tracking completion.

### 🚫 Unsubscribe Hub

- Groups promotional and duplicate senders by message count
- **One-click trash**: queries Gmail for **ALL-TIME** messages from a sender (not just local DB)
- Direct links to unsubscribe URLs parsed from email headers
- Running stats (**total emails cleared**, **bytes freed**) persisted in `localStorage`

### 🧹 Storage Saver Agent

Modal dialog for bulk inbox cleaning:

| Strategy | Description |
|---|---|
| **Duplicates Only** | Remove deduplicated newsletter copies |
| **Promotions Only** | Clean promotional emails |
| **Both** | Combined cleanup |

Features **resilient batch trash** with individual fallback — if a batch operation fails, it retries each email individually. Cleans both the local database and Gmail trash simultaneously.

### 🔄 On-the-fly Re-summarization

If an email's summary shows *"Failed to summarize"*, Repeatless **automatically retriggers** Gemini summarization when that email is selected — no manual intervention required.

### 📖 Email Detail Pane

Dual-tab view for every email:

| Tab | Content |
|---|---|
| **AI Summary** | Importance badge, action items list, reply suggestion chips, calendar booking, copy-to-clipboard |
| **Original** | Sanitized HTML rendered in a secure iframe |

### 🔌 Slack Notification Hub

Allows real-time syncing and alerts to Slack channels:
- **OAuth 2.0 Flow**: Seamless connection and workspace validation via the Slack Web API.
- **Auto-Join**: Option to list and automatically join selected public channels.
- **Workflow Action**: Can be scheduled to post daily digests and notifications directly to designated channels.

### 📅 Calendar Scheduler

Schedule meetings directly from email summaries:
- **Gmail-to-Calendar Booking**: Analyzes action items and reply suggestions to automatically book events on Google Calendar.
- **OAuth 2.0 Integration**: Uses Gmail API token permissions to create and reference calendar invites.

### 🔁 Automated Workflows & Custom Webhooks

Schedule repetitive actions and trigger downstream hooks:
- **Cron Jobs**: Leverage Vercel Cron-triggered endpoints protected by a `CRON_SECRET` to execute recurring workflows (e.g. daily Slack summary).
- **Webhooks**: POST or GET custom JSON payloads to third-party endpoints. Features optional HMAC signing keys (secrets) for payload verification.

### 🛡️ Query Cache & Sliding-Window Rate Limiting

Robust systems designed for resource safety and cost management:
- **RAG Cache**: Caches semantic RAG answers using SHA-256 query hashes, avoiding redundant AI/LLM tokens (TTL: 24 hours).
- **Rate Limiting**: Sliding window rate limits (sliding window counter) restrict the maximum requests per user per minute to ensure API safety.

---

## 🏗️ Architecture Overview

```mermaid
graph TB
    subgraph Client["🖥️ Browser"]
        UI["React 19 SPA<br/>page.tsx (~3900 lines)"]
    end

    subgraph NextJS["⚡ Next.js 16 App Router"]
        Auth["/api/auth/**<br/>NextAuth v4"]
        Sync["/api/sync<br/>Gmail Sync"]
        Emails["/api/emails<br/>Fetch & Filter"]
        Summarize["/api/emails/summarize<br/>Re-summarize"]
        Chat["/api/chat<br/>Copilot RAG & Cache"]
        Reply["/api/reply<br/>Smart Reply"]
        Clean["/api/clean<br/>Bulk Trash"]
        Slack["/api/slack/**<br/>OAuth & Channels"]
        Calendar["/api/calendar/**<br/>Google Calendar"]
        Workflows["/api/workflows/**<br/>Automation & Cron"]
        Webhooks["/api/webhooks/**<br/>Custom endpoints"]
    end

    subgraph Services["🔧 Core Services"]
        GeminiSvc["gemini.ts<br/>Gemini AI Service"]
        GmailSvc["gmail.ts<br/>Gmail API Service"]
        AuthCfg["auth.ts<br/>NextAuth Config"]
        DB["db.ts<br/>Prisma Singleton"]
        CronSvc["cron.ts<br/>Workflow Scheduler"]
        CalendarSvc["calendar.ts<br/>Google Calendar API"]
    end

    subgraph External["☁️ External APIs"]
        Google["Google OAuth & Calendar"]
        Gmail["Gmail API"]
        SlackAPI["Slack Web API"]
        Gemini["Gemini 2.0<br/>Flash Lite"]
        PG["PostgreSQL"]
    end

    UI -->|API calls| NextJS
    Auth --> AuthCfg --> Google
    Sync --> GmailSvc --> Gmail
    Sync --> GeminiSvc --> Gemini
    Summarize --> GeminiSvc
    Chat --> GeminiSvc
    Reply --> GeminiSvc
    Reply --> GmailSvc
    Clean --> GmailSvc
    Slack --> SlackAPI
    Calendar --> CalendarSvc --> Google
    Workflows --> CronSvc
    NextJS --> DB --> PG
```

> For a deeper dive, see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 🛠️ Tech Stack

| Layer | Technology | Version |
|---|---|---|
| **Framework** | Next.js (App Router, Turbopack) | 16.2.9 |
| **Language** | TypeScript | 5 |
| **UI** | React | 19.2.4 |
| **Icons** | Lucide React | — |
| **Styling** | Styled-JSX, vanilla CSS | — |
| **Authentication** | NextAuth (Google OAuth 2.0, JWT) | v4 |
| **Database** | PostgreSQL via Prisma ORM | 6.19.3 |
| **AI** | Google Gemini (`gemini-2.0-flash-lite`) via `@google/genai` | 2.8.0 |
| **Email** | Gmail API via `googleapis` | v173 |
| **Integrations** | Slack Web API, Google Calendar API | — |
| **Hosting** | Vercel (recommended), Firebase App Hosting | — |

---

## 📂 Project Structure

```
repeatless/
├── prisma/
│   ├── schema.prisma              # Database schema (User, Email, Workflow, QueryCache, etc.)
│   └── migrations/                # Prisma migration history
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts   # NextAuth OAuth handler
│   │   │   ├── calendar/                     # Calendar booking route
│   │   │   │   └── book/route.ts
│   │   │   ├── chat/route.ts                 # Gemini Copilot chat endpoint
│   │   │   ├── clean/route.ts                # Bulk trash / storage saver
│   │   │   ├── cron/                         # Background cron entrypoints
│   │   │   │   └── workflows/route.ts
│   │   │   ├── emails/route.ts               # Email fetch with filters
│   │   │   ├── emails/summarize/route.ts     # On-the-fly re-summarization
│   │   │   ├── reply/route.ts                # AI draft & send via Gmail
│   │   │   ├── slack/                        # Slack OAuth, channels, status APIs
│   │   │   ├── sync/route.ts                 # Gmail thread-first sync pipeline
│   │   │   ├── webhooks/                     # Webhooks connection management
│   │   │   └── workflows/                    # Workflows CRUD & execution routes
│   │   ├── globals.css             # Design system & global styles
│   │   ├── layout.tsx              # Root layout with Providers wrapper
│   │   └── page.tsx                # Main application UI (~3900 lines)
│   ├── components/
│   │   └── Providers.tsx           # NextAuth SessionProvider
│   ├── generated/
│   │   └── client/                 # Prisma generated client
│   └── lib/
│       ├── auth.ts                 # NextAuth configuration & callbacks
│       ├── calendar.ts             # Google Calendar API helper
│       ├── cron.ts                 # Workflow automation runner engine
│       ├── db.ts                   # Prisma client singleton
│       ├── gemini.ts               # Gemini AI service (summarize, chat, reply)
│       └── gmail.ts                # Gmail API service (fetch, send, trash)
├── .env.example                    # Environment variable template
├── ARCHITECTURE.md                 # Detailed architecture documentation
├── DEPLOYMENT.md                   # Deployment guide (Vercel, Firebase)
├── package.json
└── README.md                       # ← You are here
```

---

## 🚀 Getting Started

### Prerequisites

| Requirement | Minimum |
|---|---|
| **Node.js** | v18+ |
| **npm** | v9+ |
| **PostgreSQL** | v14+ (or a hosted provider like [Neon](https://neon.tech) / [Supabase](https://supabase.com)) |
| **Google Cloud Project** | With Gmail API and Google Calendar API enabled |
| **Google AI Studio** | API key for Gemini |

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/Vamshidathrika/repeatless.git
cd repeatless

# 2. Install dependencies
npm install

# 3. Copy the environment template
cp .env.example .env
```

### Google Cloud Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. **Enable APIs**:
   - Navigate to **APIs & Services → Library**
   - Search for **Gmail API** and click **Enable**
   - Search for **Google Calendar API** and click **Enable**
4. **Configure OAuth Consent Screen**:
   - Navigate to **APIs & Services → OAuth consent screen**
   - Choose **External** user type
   - Fill in the required app information
   - Add scopes: `openid`, `email`, `profile`, `gmail.readonly`, `gmail.modify`, `gmail.send`, `https://www.googleapis.com/auth/calendar.events`
   - Add your email as a **test user**
5. **Create OAuth Credentials**:
   - Navigate to **APIs & Services → Credentials**
   - Click **Create Credentials → OAuth Client ID**
   - Application type: **Web application**
   - Add authorized redirect URIs:
     ```
     http://localhost:3000/api/auth/callback/google
     ```
   - Copy the **Client ID** and **Client Secret**

### Environment Variables

Create a `.env` file in the project root with the following variables:

```env
# ── Database ──────────────────────────────────────────────
DATABASE_URL="postgresql://user:password@host:5432/repeatless?sslmode=require"
DIRECT_URL="postgresql://user:password@host:5432/repeatless"

# ── NextAuth ──────────────────────────────────────────────
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET=""  # Generate with: openssl rand -base64 32

# ── Google OAuth ──────────────────────────────────────────
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"

# ── Google Gemini AI ──────────────────────────────────────
GEMINI_API_KEY="your-gemini-api-key"

# ── Groq API fallback ─────────────────────────────────────
GROQ_API_KEY="your-groq-api-key"

# ── Slack OAuth Integration ────────────────────────────────
SLACK_CLIENT_ID="your-slack-client-id"
SLACK_CLIENT_SECRET="your-slack-client-secret"

# ── Cron secret key ───────────────────────────────────────
CRON_SECRET="your-cron-secret-key"
```

### Database Setup

```bash
# Generate the Prisma client
npx prisma generate

# Push the schema to your database
npx prisma db push
```

### Run the App

```bash
npm run dev
```

The app will start at **[http://localhost:3000](http://localhost:3000)** with Turbopack for fast refresh.

---

## 🗄️ Database Schema

```mermaid
erDiagram
    User ||--o{ Account : has
    User ||--o{ Session : has
    User ||--o| UserPreference : has
    User ||--o{ Email : owns
    User ||--o| SyncState : tracks
    User ||--o{ Workflow : schedules
    User ||--o{ WebhookConnection : connects
    Email ||--o| EmailSummary : has

    User {
        string id PK
        string name
        string email UK
        string image
    }

    Account {
        string id PK
        string userId FK
        string provider
        string providerAccountId
        string access_token
        string refresh_token
        int expires_at
    }

    UserPreference {
        string id PK
        string userId FK
        json categories
        int dedupWindowHrs
        string summaryModel
        string chatModel
    }

    Email {
        string id PK "Gmail message ID"
        string threadId
        string userId FK
        string subject
        string sender
        string receiver
        datetime date
        string bodySnippet
        text bodyContent
        text htmlContent
        string unsubscribeUrl
        json labels
        boolean isDuplicate
        string dedupHash
    }

    EmailSummary {
        string id PK
        string emailId FK
        string shortSummary
        text detailedSummary
        json actionItems
        string category
        int importanceScore
        json replySuggestions
    }

    SyncState {
        string id PK
        string userId FK UK
        string lastHistoryId
        datetime lastSyncAt
    }

    WebhookConnection {
        string id PK
        string userId FK
        string name
        string description
        string url
        string method
        string headers
        string emoji
        string secret
        datetime lastTestedAt
        string lastTestStatus
        int lastTestCode
    }

    Workflow {
        string id PK
        string userId FK
        string name
        string description
        boolean enabled
        string schedule
        string timezone
        string actions
        datetime lastRunAt
        datetime nextRunAt
        string lastRunStatus
        string lastRunLog
    }

    QueryCache {
        string id PK
        string userId
        string queryHash
        string queryText
        string answer
        int hitCount
        datetime createdAt
        datetime expiresAt
    }

    RateLimit {
        string id PK
        string userId
        datetime windowStart
        int requestCount
    }
```

---

## 📡 API Reference

| Route | Method | Description |
|---|---|---|
| `/api/auth/[...nextauth]` | `GET` / `POST` | NextAuth Google OAuth lifecycle handler |
| `/api/sync` | `POST` | Triggers thread-first Gmail sync, body extraction, duplicate detection, and summarization |
| `/api/emails` | `GET` | Fetches saved emails with filter/search options |
| `/api/emails/summarize` | `POST` | Performs on-demand re-summarization of an email |
| `/api/chat` | `POST` | Gemini Copilot conversational assistant (with query caching and rate limits) |
| `/api/reply` | `POST` | AI Smart Reply generation and direct Gmail reply execution |
| `/api/clean` | `POST` | Resilient batch cleanup of duplicates, categories, or senders |
| `/api/slack/connect` | `GET` | Initiates the Slack OAuth connection flow |
| `/api/slack/callback` | `GET` | Slack OAuth callback exchange and database account credentials update |
| `/api/slack/status` | `GET` | Returns details about whether Slack is connected for the user |
| `/api/slack/channels` | `GET` | Retrieves accessible public and private Slack channels for posting digests |
| `/api/slack/disconnect` | `POST` | Removes the Slack account reference from database |
| `/api/jira/connect` | `GET` | Initiates the Jira OAuth connection flow |
| `/api/jira/callback` | `GET` | Jira OAuth callback exchange and credentials update |
| `/api/jira/status` | `GET` | Returns details about whether Jira is connected |
| `/api/jira/projects` | `GET` | Lists available Atlassian Jira projects to host tickets |
| `/api/jira/issue` | `POST` | Creates a structured Jira ticket from an email action item |
| `/api/jira/disconnect` | `POST` | Removes the Jira account reference from database |
| `/api/calendar/book` | `POST` | Schedules and creates an event in Google Calendar |
| `/api/workflows` | `GET`/`POST` | Lists all workflows or creates a new automated workflow |
| `/api/workflows/[id]` | `PUT`/`DELETE` | Updates or deletes an automated workflow config |
| `/api/workflows/run` | `POST` | Manually triggers active workflow steps |
| `/api/cron/workflows` | `GET`/`POST` | Chrono automation trigger protected by `CRON_SECRET` validation |
| `/api/webhooks` | `GET`/`POST` | Lists all webhooks or connects a new webhook endpoint |
| `/api/webhooks/[id]` | `PUT`/`DELETE` | Updates or deletes a webhook endpoint configuration |
| `/api/webhooks/test` | `POST` | Triggers a test payload transmission to a webhook URL |

---

## ✅ Verification Guide

Follow these steps to verify a successful setup:

| Step | Action | Expected Result |
|:---:|---|---|
| 1 | Open **http://localhost:3000** | SaaS-style login page with animated gradient panel |
| 2 | Click **Continue with Google** | Google OAuth consent screen appears |
| 3 | Authorize and return | Redirected to the main inbox view |
| 4 | Click **Sync Inbox** in the sidebar | Emails are fetched, summarized, and displayed in threaded groups |
| 5 | Click any email thread | AI Summary tab shows importance score, action items, and reply suggestions |
| 6 | Click **Book Event** next to a suggestion | Calendar schedule popup appears; booking registers directly in Google Calendar |
| 7 | Click **Create Jira Ticket** on an action item | Populates ticket title/description, submits directly to select Jira project |
| 8 | Navigate to **Integrations** / **Settings** | Slack Connection panels show Connect options. Complete Slack OAuth successfully |
| 9 | Navigate to **Workflows & Webhooks** | Define a new workflow to post daily digests to Slack; execute a test run successfully |
| 10 | Open **Gemini Copilot** chat | Chat interface with text input appears |
| 11 | Type *"Summarize my week"* | Copilot returns a cached semantic summary or queries DB under sliding rate limits |

---

## 🌐 Deployment

Repeatless is optimized for deployment on **Vercel** (recommended) and also supports **Firebase App Hosting**.

For detailed deployment instructions, production environment configuration, and platform-specific guides, see:

📘 **[DEPLOYMENT.md](DEPLOYMENT.md)**

> [!TIP]
> When deploying to production, remember to update `NEXTAUTH_URL` to your production domain and add the production callback URIs for Google, Slack, and Jira to their respective developer portals.

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the **MIT License**.

```
MIT License

Copyright (c) 2026 Repeatless

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

<p align="center">
  Built with ❤️ using Next.js, Gemini AI, and the Gmail API
</p>
