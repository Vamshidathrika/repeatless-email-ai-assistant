# AI Gmail Intelligence Platform - Architecture & Design

## 1. High-Level System Overview

The AI Gmail Intelligence Platform is designed as a secure, single-user web workspace / web application that seamlessly integrates with a user's Gmail account to provide intelligent email processing, summarization, and an interactive AI assistant. Built on a foundation of **Antigravity** for orchestrating complex LLM pipelines and asynchronous background tasks, the system exposes a lightweight web frontend (React/Next.js) for user interaction. This architecture prioritizes data privacy and modularity; it intentionally eschews multi-tenant complexity in favor of a deeply customizable, config-driven environment where the user's data remains isolated and securely managed.

By decoupling the web presentation layer from the heavy lifting of email synchronization and AI inference, the platform ensures low perceived latency for end-user actions. The web app acts as a clean, minimal dashboard—displaying pre-computed summaries and handling real-time chat queries—while Antigravity robustly manages Gmail OAuth flows, idempotent background syncing, categorization, deduplication, thread-aware summarization, and AI-assisted drafting. This separation of concerns not only facilitates rapid iteration but also exemplifies strong engineering practices tailored for a personalized AI workspace.

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
|  | (Next.js/React)|        |    (Node.js / Python)    |       | (Emails, Sync  |  |
|  |                |        |                          |       |  State, Config)|  |
|  +-------+--------+        +-------------+------------+       +----------------+  |
|          |                               |                                        |
|          | (Chat / UI actions)           | (Triggers / Webhooks / API)            |
|          v                               v                                        |
|  +-----------------------------------------------------------------------------+  |
|  |                               Antigravity                                   |  |
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
    |  Gmail API  |         |   LLM API   |         | Vector DB   |
    |             |         | (Summaries/ |         | (Optional   |
    |             |         |  Drafts)    |         |  Search)    |
    +-------------+         +-------------+         +-------------+
```

### Component Flows

**Flow A: Initial Gmail Connect (OAuth)**
- `[Web Frontend]` -> Initiates OAuth flow.
- `[Backend]` -> Validates callback, encrypts & stores tokens in `[PostgreSQL]`.
- `[Backend]` -> Notifies `[Antigravity]` to validate the connection and prepare for sync.

**Flow B: Background Email Sync + Summarization**
- `[Antigravity]` -> Checks `[PostgreSQL]` for sync state (e.g., `historyId`).
- `[Antigravity]` -> Calls `[Gmail API]` for new/modified emails.
- `[Antigravity]` -> Filters and deduplicates newsletters.
- `[Antigravity]` -> Calls `[LLM API]` to generate summaries, categories, and action items.
- `[Antigravity]` -> Persists processed emails, thread context, and summaries to `[PostgreSQL]`.

**Flow C: Chat Query -> Retrieve Context -> LLM Answer**
- `[Web Frontend]` -> Sends user query (e.g., "Summarize my week") to `[Backend]`.
- `[Backend]` -> Routes to `[Antigravity Chat Agent]`.
- `[Antigravity Chat Agent]` -> Translates query to SQL/Vector search to retrieve context from `[PostgreSQL]`.
- `[Antigravity Chat Agent]` -> Calls `[LLM API]` with context to generate an answer.
- `[Antigravity Chat Agent]` -> Streams or returns the answer back to `[Web Frontend]`.

**Flow D: Compose/Reply via AI**
- `[Web Frontend]` -> Sends draft intent (e.g., "Politely decline this offer") to `[Backend]`.
- `[Backend]` -> Routes to `[Antigravity Writer]`.
- `[Antigravity Writer]` -> Fetches thread context from `[PostgreSQL]`.
- `[Antigravity Writer]` -> Calls `[LLM API]` to generate a draft.
- `[Web Frontend]` -> User reviews/edits and approves the draft.
- `[Backend]` -> Calls `[Gmail API]` to send the email and appends the sent message to `[PostgreSQL]`.

---

## 3. Concrete Antigravity Workflow Design

The core logic of the platform is broken down into specific, idempotent workflows orchestrated by Antigravity.

### Flow A: Initial Gmail Connection and Token Storage
1. **Initiate**: The user clicks "Connect Gmail" on the frontend, redirecting them to the Google OAuth consent screen requesting read, send, and modify scopes.
2. **Callback Handling**: Google redirects back to the Backend API with an authorization code.
3. **Exchange & Encrypt**: The Backend exchanges the code for an `access_token` and `refresh_token`. It immediately encrypts these tokens using a secure platform secret (AES-256-GCM). At no point are Gmail passwords handled; all access uses OAuth tokens only, which are stored encrypted and never logged.
4. **Persist State**: The encrypted tokens and user profile data are saved to the `gmail_credentials` table.
5. **Kickoff Initial Sync**: The Backend triggers an Antigravity background task to perform the initial historical sync (e.g., fetching the last 7 days of emails).

### Flow B: Scheduled Email Sync and Summarization
*(Includes Deduplication Logic)*
1. **Trigger**: Run via a cron schedule (e.g., every 5 minutes) or triggered by a Gmail Push notification (Pub/Sub webhook).
2. **Fetch State**: Antigravity retrieves the user's `last_history_id` or `last_sync_timestamp` from the database.
3. **Fetch Emails**: Calls the Gmail API `users.messages.list` for new messages, then fetches full payload details for the resulting IDs.
4. **Deduplication / Newsletter Check**: 
   - Before processing, Antigravity generates a hash for each email (e.g., `normalized_sender + normalized_subject + date_bucket`).
   - If a similar hash exists in the database within a specific time window, the email is flagged as a duplicate/newsletter and skips heavy LLM processing.
5. **Thread Consolidation**: Emails are grouped by `thread_id`. Existing thread summaries are retrieved from the database to provide context to the LLM for new replies.
6. **LLM Processing (Batching)**:
   - **Input**: Email body (stripped of HTML and signatures), sender, subject, and thread history.
   - **Output**: Structured JSON containing `short_summary`, `action_items`, `importance_score`, and `category` (e.g., Important, Promotions, Finance).
7. **Persist**: Results are upserted into the `emails` and `email_summaries` PostgreSQL tables. Sync state (`last_history_id` / `last_sync_timestamp`) is updated after successful processing, making the workflow idempotent and safe to retry.

### Flow C: Chat Query Handling
1. **Receive Query**: Antigravity receives a chat message from the user.
2. **Intent Parsing & Query Generation**:
   - Calls a fast LLM to classify intent (Search, Summarize, Action) and extract entities (e.g., Sender: "Manager", Timeframe: "Unread").
   - Translates the intent into a structured SQL query or vector similarity search over email embeddings (if the vector DB is enabled).
3. **Context Retrieval**: Executes the query and retrieves the top N relevant email summaries and metadata.
4. **Answer Generation**:
   - Prompts the primary LLM with a system prompt, the User Query, and the Retrieved Context.
   - Generates a conversational response with citations (e.g., "Your manager emailed you about the release... [Thread ID: 123]").
5. **Return**: The response is formatted and sent back to the frontend for rendering.

---

## 4. Simple Data Model (Non-multi-tenant)

The schema design favors a lightweight and flat structure, built around a single primary identity. It avoids complex foreign keys tied to multiple organizations, keeping it perfectly suited for a personal workspace.

- **`user_profile`**: Stores the user's preferences, LLM configurations (e.g., system prompts, chosen models), and specific workspace settings (like custom categories and deduplication time windows).
- **`gmail_credentials`**: Safely holds the encrypted OAuth 2.0 `access_token` and `refresh_token`, linked to the single user.
- **`emails`**: The core raw data table for email metadata: `id` (Gmail Message ID), `thread_id`, `subject`, `sender`, `date`, `labels`, and boolean flags like `is_duplicate`.
- **`email_summaries`**: Stores the structured LLM-generated outputs tied to the `emails` table. Includes `short_summary`, `detailed_summary`, `action_items` (JSON array), `category`, and an `importance_score` (1-10).
- **`email_embeddings` (Optional)**: If `pgvector` is enabled, this table stores the 1536-dimensional (or similar) vector embeddings of the email bodies and summaries to power semantic similarity search in chat queries.

---

## 5. Newsletter Dedup Logic (Bonus Feature)

To ensure the workspace and the AI's chat context aren't diluted by repetitive automated emails, we use a robust deduplication heuristic executed inside the Antigravity sync flow.

- **Detection**: First, incoming emails are scanned for common automated markers (e.g., presence of `List-Unsubscribe` headers, known promotional senders, or specific Gmail categories like "Promotions").
- **Signature Generation**: For candidate newsletters, the system generates a deterministic hash. This signature combines the normalized sender domain, the normalized subject line (stripping out dates and incrementing numbers), and a configurable date bucket (e.g., the current calendar week).
  - *Example Signature:* `hash("marketing@acme.com" + "weekly product update" + "2023-W42")`
- **Deduplication Action**: 
  - If the signature already exists in the `emails` table within the current time bucket, the new email is immediately flagged as `is_duplicate = true`.
  - The heavy, expensive LLM summarization step is skipped for this email, saving tokens and processing time.
  - In the frontend UI, these emails are visually grouped or minimized by default, keeping the summary feed clean.

---

## 6. Security & Privacy Considerations

Because this platform processes deeply personal communications, security and privacy are foundational to the architecture.

- **Strict OAuth 2.0 Usage**: At no point are Gmail passwords requested or handled. All access uses Google's standard OAuth 2.0 flow with granular, least-privilege scopes.
- **Secure Token Storage**: The `refresh_token` and `access_token` are encrypted at rest using AES-256-GCM via a platform-level secret key before being stored in PostgreSQL.
- **No Full-Body Logging**: Application logs never record the full body of an email. Logging is strictly restricted to message IDs, timestamps, and metadata necessary for debugging state transitions.
- **Data Isolation**: Since the architecture targets a single-user workspace, there is no risk of cross-tenant data leakage. The database, indexes, and backend runtimes are entirely dedicated to one identity.
- **Encrypted Transit**: All communication between the web frontend, backend, Antigravity, and external APIs (Gmail, LLMs) strictly enforces TLS 1.2+ over HTTPS.
- **Minimal Retention of Secrets**: LLM API keys and Google Client Secrets are injected as environment variables at runtime and are never hardcoded or exposed to the frontend.
