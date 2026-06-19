# Aether — Tradeoffs & Limitations

This document outlines key technical tradeoffs, rate limit constraints, and system limitations of the Aether platform.

---

## 1. Gmail API Quotas & Rate Limits

The Google Gmail API operates on a strict **Quota Unit (QU)** structure.
- **Standard Quota Limits**: Each project receives a limit of 1,000,000 quota units per day and a rate limit of 250 units/second.
- **API Call Cost Breakdown**:
  - `users.threads.list`: **1 unit**
  - `users.threads.get` (full format): **10 units**
  - `users.messages.send`: **100 units**

### 1.1 Mitigation Tradeoffs
To fetch a thread of 5 messages, the system makes a `threads.get` call costing 10 units. However, performing this for 50 threads in a single sync loop consumes 500 units, easily hitting Google's rate limit.
- **Current Strategy**: Limits default sync parameters to 20 threads per request.
- **Alternative Tradeoff**: Implementing a batch sync worker or using the `gmail.users.watch` push notification endpoint would reduce periodic poll overhead, but adds significant system complexity (requiring a pub/sub server and publicly accessible webhook endpoints).

---

## 2. LLM Context Windows & Token Costs

As conversations grow, compiling the entire history into a single rolling string for AI input increases token usage.

```
[Oldest Message] ──> [Intermediate Message] ──> [Current Message]
└─────────────────────────────────────────────────────────────┘
          Accumulated Context String (Passed to LLM)
```

### 2.1 Context Constraints
- **Context Limits**: Large active threads (50+ emails) can exceed model context limits (e.g., 8k or 32k tokens) or trigger API payload size limits.
- **Financial Tradeoff**: Passing large histories to models like Llama 3.3 70B raises input token costs.
- **Current Approach**: The email body input is sliced to 10,000 characters to cap memory and costs, but this may clip crucial details in long message histories.

---

## 3. MIME Traversal & Content Parsing Edge Cases

Email clients use highly variable MIME configurations.
- **Multipart Structure Complexity**: Complex nested formats (e.g. `multipart/alternative` nested inside `multipart/mixed`) can result in parsed bodies containing raw base64 data or losing styling.
- **Forwarding Clutter**: Forwarded email logs contain repeating headers (e.g., `---------- Forwarded message ---------`), adding noise to the context window and confusing the summarization model.
- **HTML Cleaning**: Stripping HTML tags for plain text contexts works for simple structures but destroys layout context for tables, structured grids, and embedded links.

---

## 4. Newsletter Deduplication False Positives

Aether's deduplication mechanism normalized subjects and bucketed them by week.
- **The Tradeoff**: If a publisher sends two different newsletters within the same week using the exact same subject line (e.g., "Daily Update"), the system will flag the second newsletter as a duplicate and skip AI summarization.
- **Risk**: Users might miss new content if the publisher doesn't vary subject lines.
- **Mitigation Option**: Adding a character count or quick body diff (hash of the first 100 characters of the body) would prevent false positives, at the cost of database query overhead.

---

## 5. Token Invalidation & Session Revocation

Aether stores Google refresh tokens in the database to fetch emails asynchronously.
- **The Issue**: If a user revokes access to the app via Google Accounts settings, or if the token is invalidated (e.g., password change), background cron jobs will fail.
- **Current Action**: The system catches credential errors and logs them. However, it lacks an automated dashboard notification or email warning to alert the user to re-authenticate, meaning the UI may show stale data without explanation.
