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
| **AI Summary** | Importance badge, action items list, reply suggestion chips, copy-to-clipboard |
| **Original** | Sanitized HTML rendered in a secure iframe |

---

## 🏗️ Architecture Overview

```mermaid
graph TB
    subgraph Client["🖥️ Browser"]
        UI["React 19 SPA<br/>page.tsx (~3700 lines)"]
    end

    subgraph NextJS["⚡ Next.js 16 App Router"]
        Auth["/api/auth/**<br/>NextAuth v4"]
        Sync["/api/sync<br/>Gmail Sync"]
        Emails["/api/emails<br/>Fetch & Filter"]
        Summarize["/api/emails/summarize<br/>Re-summarize"]
        Chat["/api/chat<br/>Copilot"]
        Reply["/api/reply<br/>Smart Reply"]
        Clean["/api/clean<br/>Bulk Trash"]
    end

    subgraph Services["🔧 Core Services"]
        GeminiSvc["gemini.ts<br/>Gemini AI Service"]
        GmailSvc["gmail.ts<br/>Gmail API Service"]
        AuthCfg["auth.ts<br/>NextAuth Config"]
        DB["db.ts<br/>Prisma Singleton"]
    end

    subgraph External["☁️ External APIs"]
        Google["Google OAuth 2.0"]
        Gmail["Gmail API"]
        Gemini["Gemini 2.0<br/>Flash Lite"]
        PG["PostgreSQL"]
    end

    UI -->|API calls| Auth & Sync & Emails & Summarize & Chat & Reply & Clean
    Auth --> AuthCfg --> Google
    Sync --> GmailSvc --> Gmail
    Sync --> GeminiSvc --> Gemini
    Summarize --> GeminiSvc
    Chat --> GeminiSvc
    Reply --> GeminiSvc
    Reply --> GmailSvc
    Clean --> GmailSvc
    Emails --> DB --> PG
    Sync --> DB
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
| **Hosting** | Vercel (recommended), Firebase App Hosting | — |

---

## 📂 Project Structure

```
repeatless/
├── prisma/
│   ├── schema.prisma              # Database schema (User, Email, Summary, etc.)
│   └── migrations/                # Prisma migration history
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts   # NextAuth OAuth handler
│   │   │   ├── chat/route.ts                 # Gemini Copilot chat endpoint
│   │   │   ├── clean/route.ts                # Bulk trash / storage saver
│   │   │   ├── emails/route.ts               # Email fetch with filters
│   │   │   ├── emails/summarize/route.ts     # On-the-fly re-summarization
│   │   │   ├── reply/route.ts                # AI draft & send via Gmail
│   │   │   └── sync/route.ts                 # Gmail thread-first sync pipeline
│   │   ├── globals.css             # Design system & global styles
│   │   ├── layout.tsx              # Root layout with Providers wrapper
│   │   └── page.tsx                # Main application UI (~3700 lines)
│   ├── components/
│   │   └── Providers.tsx           # NextAuth SessionProvider
│   ├── generated/
│   │   └── client/                 # Prisma generated client
│   └── lib/
│       ├── auth.ts                 # NextAuth configuration & callbacks
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
| **Google Cloud Project** | With Gmail API enabled |
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
3. **Enable the Gmail API**:
   - Navigate to **APIs & Services → Library**
   - Search for "Gmail API" and click **Enable**
4. **Configure OAuth Consent Screen**:
   - Navigate to **APIs & Services → OAuth consent screen**
   - Choose **External** user type
   - Fill in the required app information
   - Add scopes: `openid`, `email`, `profile`, `gmail.readonly`, `gmail.modify`, `gmail.send`
   - Add your email as a **test user**
5. **Create OAuth Credentials**:
   - Navigate to **APIs & Services → Credentials**
   - Click **Create Credentials → OAuth Client ID**
   - Application type: **Web application**
   - Add authorized redirect URI:
     ```
     http://localhost:3000/api/auth/callback/google
     ```
   - Copy the **Client ID** and **Client Secret**

### Environment Variables

Create a `.env` file in the project root with the following variables:

```env
# ── Database ──────────────────────────────────────────────
DATABASE_URL="postgresql://user:password@host:5432/repeatless?sslmode=require"

# ── NextAuth ──────────────────────────────────────────────
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET=""  # Generate with: openssl rand -base64 32

# ── Google OAuth ──────────────────────────────────────────
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"

# ── Google Gemini AI ──────────────────────────────────────
GEMINI_API_KEY="your-gemini-api-key"
```

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Neon, Supabase, or local) |
| `NEXTAUTH_URL` | Canonical URL of the app (`http://localhost:3000` for dev) |
| `NEXTAUTH_SECRET` | Session encryption key — generate with `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | OAuth Client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | OAuth Client Secret from Google Cloud Console |
| `GEMINI_API_KEY` | API key from [Google AI Studio](https://aistudio.google.com/apikey) |

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
```

> [!NOTE]
> The `User`, `Account`, `Session`, and `VerificationToken` models follow the standard **NextAuth v4 Prisma adapter** schema. The full schema is defined in [`prisma/schema.prisma`](prisma/schema.prisma).

---

## 📡 API Reference

| Route | Method | Description |
|---|---|---|
| `/api/auth/[...nextauth]` | `GET` / `POST` | NextAuth Google OAuth handler — login, callback, session, and signout |
| `/api/sync` | `POST` | Triggers the Gmail thread-first sync pipeline. Fetches threads, extracts bodies, parses headers, generates AI summaries, and detects duplicates |
| `/api/emails` | `GET` | Fetch synced emails with support for `category`, `search`, and `isDuplicate` query filters |
| `/api/emails/summarize` | `POST` | On-the-fly re-summarization of a single email via Gemini |
| `/api/chat` | `POST` | Gemini Copilot — accepts a natural language query and returns a contextual response using thread-first RAG over synced emails |
| `/api/reply` | `POST` | AI smart reply — `action=draft` generates a reply, `action=send` sends it via Gmail API with RFC 2822 threading headers |
| `/api/clean` | `POST` | Bulk trash emails by strategy (`duplicates`, `promotions`, `both`), sender, or explicit email IDs |

> [!TIP]
> All API routes are **session-protected**. Requests without a valid NextAuth session will receive a `401 Unauthorized` response.

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
| 6 | Click **Smart Reply**, type an instruction, click **Compose** | Gemini drafts a context-aware reply with subject and body |
| 7 | Review the draft and click **Send** | Email is sent via Gmail with proper threading headers |
| 8 | Open **Gemini Copilot** chat | Chat interface with text input appears |
| 9 | Type *"Summarize my week"* | Copilot returns a natural language summary drawn from synced emails |
| 10 | Switch to the **Priority Matrix** tab | Eisenhower 4-quadrant view with emails sorted by importance |
| 11 | Switch to the **Unsubscribe Hub** | Senders grouped by count with trash and unsubscribe actions |
| 12 | Click **Storage Saver** in the sidebar | Modal with strategy options for bulk cleanup |

---

## 🌐 Deployment

Repeatless is optimized for deployment on **Vercel** (recommended) and also supports **Firebase App Hosting**.

For detailed deployment instructions, production environment configuration, and platform-specific guides, see:

📘 **[DEPLOYMENT.md](DEPLOYMENT.md)**

> [!TIP]
> When deploying to production, remember to update `NEXTAUTH_URL` to your production domain and add the production callback URI to your Google OAuth credentials.

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
