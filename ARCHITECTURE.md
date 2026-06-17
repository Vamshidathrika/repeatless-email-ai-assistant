# AI Gmail Intelligence Platform - Architecture & Design

## 1. High-Level System Overview

The AI Gmail Intelligence Platform is designed as a secure, single-user web workspace / web application that seamlessly integrates with a user's Gmail account to provide intelligent email processing, summarization, and an interactive AI assistant. Built on a framework of robust background execution for orchestrating complex LLM pipelines and asynchronous sync tasks, the system exposes a lightweight web frontend (React/Next.js) for user interaction. This architecture prioritizes data privacy and modularity; it intentionally eschews multi-tenant complexity in favor of a deeply customizable, config-driven environment where the user's data remains isolated and securely managed.

By decoupling the web presentation layer from the heavy lifting of email synchronization and AI inference, the platform ensures low perceived latency for end-user actions. The web app acts as a clean, minimal dashboard—displaying pre-computed summaries and handling real-time chat queries—while the backend orchestrator robustly manages Gmail OAuth flows, idempotent background syncing, categorization, deduplication, thread-aware summarization, and AI-assisted drafting. This separation of concerns not only facilitates rapid iteration but also exemplifies strong engineering practices tailored for a personalized AI workspace.

---

## 2. Architecture Diagram & Flows

```text
+-----------------------------------------------------------------------------------+
|               Personal Workspace (Single-user, secure, configurable)              |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  +----------------+        +--------------------------+       +----------------+  |
|  |                |        |                          |       |                |  |
|  |  Web Frontend  |<------>|     Backend / API layer  |<----->|   PostgreSQL   |  |
|  | (Next.js/React)|        |    (Node.js App Router)  |       | (Emails, Sync  |  |
|  |                |        |                          |       |  State, Config)|  |
|  +-------+--------+        +-------------+------------+       +----------------+  |
|          |                               |                                        |
|          | (Chat / UI actions)           | (Triggers / Webhooks / API)            |
|          v                               v                                        |
|  +-----------------------------------------------------------------------------+  |
|  |                           Core Execution Orchestrator                       |  |
|  |                     (Orchestration & Automation Layer)                      |  |
|  |                                                                             |  |
|  |  +---------------+  +-------------------+  +-------------+  +------------+  |  |
|  |  | OAuth Manager |  | Sync & Summarize  |  | Chat Agent  |  |   Writer   |  |  |
|  |  +---------------+  +-------------------+  +-------------+  +------------+  |  |
|  +-------+-----------------------+-----------------------+---------------------+  |
|          |                       |                       |                        |
+----------|-----------------------|-----------------------|------------------------+
           |                       |                       |
           v                       v                       v
    +-------------+         +-------------+         +-------------+
    |             |         |             |         |             |
    |  Gmail API  |         |   LLM API   |         | Database    |
    |             |         | (Summaries/ |         | (Supabase/  |
    |             |         |  Drafts)    |         | PostgreSQL) |
    +-------------+         +-------------+         +-------------+
```

### Component Flows

**Flow A: Initial Gmail Connect (OAuth)**
- `[Web Frontend]` -> Initiates OAuth flow.
- `[Backend]` -> Validates callback, encrypts & stores tokens in `[PostgreSQL]`.
- `[Backend]` -> Validates connection and prepares for sync.

**Flow B: Background Email Sync + Summarization**
- `[Orchestrator]` -> Checks `[PostgreSQL]` for sync state.
- `[Orchestrator]` -> Calls `[Gmail API]` for new/modified emails.
- `[Orchestrator]` -> Filters and deduplicates newsletters.
- `[Orchestrator]` -> Calls `[LLM API]` to generate summaries, categories, and action items.
- `[Orchestrator]` -> Persists processed emails, thread context, and summaries to `[PostgreSQL]`.

**Flow C: Chat Query -> Retrieve Context -> LLM Answer**
- `[Web Frontend]` -> Sends user query (e.g., "Summarize my week") to `[Backend]`.
- `[Backend]` -> Routes to `[Chat Agent]`.
- `[Chat Agent]` -> Translates query to SQL search to retrieve context from `[PostgreSQL]`.
- `[Chat Agent]` -> Calls `[LLM API]` with context to generate an answer.
- `[Chat Agent]` -> Returns the answer back to `[Web Frontend]`.

**Flow D: Compose/Reply via AI**
- `[Web Frontend]` -> Sends draft intent (e.g., "Politely decline this offer") to `[Backend]`.
- `[Backend]` -> Routes to `[Draft Writer]`.
- `[Draft Writer]` -> Fetches thread context from `[PostgreSQL]`.
- `[Draft Writer]` -> Calls `[LLM API]` to generate a draft.
- `[Web Frontend]` -> User reviews/edits and approves the draft.
- `[Backend]` -> Calls `[Gmail API]` to send the email and updates `[PostgreSQL]`.

---

## 3. Core Workflow Design

The core logic of the platform is broken down into specific, idempotent workflows orchestrated by the backend.

### Flow A: Initial Gmail Connection and Token Storage
1. **Initiate**: The user clicks "Connect Google Account" on the frontend, redirecting them to the Google OAuth consent screen requesting read, send, and modify scopes.
2. **Callback Handling**: Google redirects back to the Backend API with an authorization code.
3. **Exchange & Encrypt**: The Backend exchanges the code for an `access_token` and `refresh_token`. It immediately stores these tokens securely. At no point are Gmail passwords handled; all access uses OAuth tokens only.
4. **Persist State**: The tokens and user profile data are saved to the `Account` database table.
5. **Kickoff Initial Sync**: The Backend triggers a background task to perform the initial historical sync (e.g., fetching recent emails).

### Flow B: Scheduled Email Sync and Summarization
*(Includes Deduplication Logic)*
1. **Trigger**: Run via manual sync action or scheduled cron processes.
2. **Fetch State**: The system retrieves the user's credentials and sync state from the database.
3. **Fetch Emails**: Calls the Gmail API `users.messages.list` for new messages, then fetches full payload details for the resulting IDs.
4. **Deduplication / Newsletter Check**: 
   - Before processing, the sync engine generates a hash for each email (e.g., `normalized_sender + normalized_subject + calendar_week`).
   - If a similar hash exists in the database within a specific time window, the email is flagged as a duplicate/newsletter and skips heavy LLM processing.
5. **Thread Consolidation**: Emails are grouped by `threadId`. Existing thread summaries are retrieved from the database to provide context to the LLM for new replies.
6. **LLM Processing**:
   - **Input**: Email body (stripped of HTML and signatures), sender, subject, and thread history.
   - **Output**: Structured JSON containing `shortSummary`, `actionItems` list, `importanceScore`, and `category` (e.g., Important, Promotions, Finance).
7. **Persist**: Results are upserted into the `Email` and `EmailSummary` PostgreSQL tables. Sync state is updated after successful processing, making the workflow idempotent and safe to retry.

### Flow C: Chat Query Handling
1. **Receive Query**: The chat endpoint receives a message from the user.
2. **Context Retrieval**: Executes keywords search over database summaries and snippets to retrieve relevant context.
3. **Answer Generation**:
   - Prompts the Gemini model with a system prompt, the User Query, and the Retrieved Context.
   - Generates a conversational response with citations (e.g., "Acme emailed you about the release...").
4. **Return**: The response is formatted and sent back to the frontend for rendering.

---

## 4. Simple Data Model (Non-multi-tenant)

The schema design favors a lightweight and flat structure, built around a single primary identity. It avoids complex foreign keys tied to multiple organizations, keeping it perfectly suited for a personal workspace.

- **`User`**: Stores the user's primary metadata (name, email, image) and links to other records.
- **`Account`**: Holds the OAuth 2.0 `access_token` and `refresh_token`, linked to the single user.
- **`UserPreference`**: Stores default configuration choices (e.g. `summaryModel`, `chatModel`).
- **`Email`**: The core raw data table for email metadata: `id` (Gmail Message ID), `threadId`, `subject`, `sender`, `date`, `labels`, and boolean flags like `isDuplicate`.
- **`EmailSummary`**: Stores the structured LLM-generated outputs tied to the `Email` table. Includes `shortSummary`, `detailedSummary`, `actionItems` (JSON stringified list), `category`, and `importanceScore` (1-10).

---

## 5. Newsletter Dedup Logic

To ensure the workspace and the AI's chat context aren't diluted by repetitive automated emails, we use a deduplication heuristic executed inside the sync flow.

- **Detection**: First, incoming emails are scanned for common automated markers.
- **Signature Generation**: For candidate newsletters, the system generates a deterministic hash. This signature combines the normalized sender domain, the normalized subject line (stripping out prefixes and special characters), and the current calendar week.
  - *Example Signature:* `hash("marketing@acme.com" + "weekly product update" + "2026-W24")`
- **Deduplication Action**: 
  - If the signature already exists in the database within the current calendar week, the new email is immediately flagged as `isDuplicate = true`.
  - The heavy, expensive LLM summarization step is skipped for this email, saving tokens and processing time.
  - A placeholder summary is created so database relationships remain intact.

---

## 6. Security & Privacy Considerations

Because this platform processes personal communications, security and privacy are foundational to the architecture.

- **Strict OAuth 2.0 Usage**: At no point are Gmail passwords requested or handled. All access uses Google's standard OAuth 2.0 flow with granular, least-privilege scopes.
- **Secure Token Storage**: The `refreshToken` and `accessToken` are safely stored in PostgreSQL.
- **No Full-Body Logging**: Application logs never record the full body of an email. Logging is restricted to message IDs, timestamps, and metadata necessary for debugging state transitions.
- **Data Isolation**: Since the architecture targets a single-user workspace, there is no risk of cross-tenant data leakage. The database, indexes, and backend runtimes are entirely dedicated to one identity.
- **Encrypted Transit**: All communication between the web frontend, backend, and external APIs (Gmail, LLMs) strictly enforces TLS 1.2+ over HTTPS.
- **Minimal Retention of Secrets**: LLM API keys and Google Client Secrets are injected as environment variables at runtime and are never hardcoded or exposed to the frontend.
