export interface SummaryResult {
  shortSummary: string;
  detailedSummary: string;
  actionItems: string[];
  category: string;
  importanceScore: number;
  replySuggestions: string[];
}

export interface DraftResult {
  subject: string;
  body: string;
}

// Helper to resolve model names based on Groq availability
function resolveModelName(modelName: string): string {
  if (!modelName) {
    return "llama-3.1-8b-instant";
  }
  
  const nameLower = modelName.toLowerCase();
  
  // Map standard/old Gemini models to their Groq equivalents
  if (
    nameLower.includes("gemini") ||
    nameLower.includes("llama-3.1") ||
    nameLower.includes("instant") ||
    nameLower.includes("gemma") ||
    nameLower.includes("qwen") ||
    nameLower.includes("mistral") ||
    nameLower.includes("mixtral")
  ) {
    return "llama-3.1-8b-instant";
  }
  
  if (
    nameLower.includes("llama-3.3") ||
    nameLower.includes("70b") ||
    nameLower.includes("versatile")
  ) {
    return "llama-3.3-70b-versatile";
  }
  
  return modelName;
}

// Helper to clean JSON responses in case models wrap output in markdown code blocks
function cleanJsonResponse(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    // Remove starting code block syntax (e.g. ```json or ```)
    cleaned = cleaned.replace(/^```[a-zA-Z]*\s*/, "");
    // Remove ending code block syntax (```)
    cleaned = cleaned.replace(/\s*```$/, "");
  }
  return cleaned.trim();
}

// Helper to make requests to NVIDIA NIM or Groq's API with an automated model fallback chain
async function fetchLLM(messages: { role: string; content: string }[], activeModel: string, jsonMode = false) {
  const nvidiaApiKey = process.env.NVIDIA_API_KEY;
  const groqApiKey = process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;

  if (!nvidiaApiKey && !groqApiKey) {
    throw new Error("Neither NVIDIA_API_KEY nor GROQ_API_KEY is configured in your environment.");
  }

  // 1. If NVIDIA NIM is configured, route there first
  if (nvidiaApiKey) {
    const nimBaseUrl = process.env.NVIDIA_NIM_BASE_URL || "https://integrate.api.nvidia.com/v1";
    
    // Resolve/map standard model names to NVIDIA NIM model names
    let nimModel = activeModel;
    if (
      activeModel.includes("llama-3.1-8b") ||
      activeModel.includes("gemini") ||
      activeModel.includes("instant") ||
      activeModel.includes("gemma")
    ) {
      nimModel = "meta/llama-3.1-8b-instruct";
    } else if (
      activeModel.includes("llama-3.3") ||
      activeModel.includes("70b") ||
      activeModel.includes("versatile")
    ) {
      nimModel = "meta/llama-3.3-70b-instruct";
    }

    const modelsToTry = [nimModel, "meta/llama-3.1-8b-instruct", "meta/llama-3.3-70b-instruct"];
    let lastError: Error | null = null;

    for (const model of modelsToTry) {
      try {
        console.log(`[NVIDIA NIM] Attempting generation with model: ${model} via ${nimBaseUrl}`);
        
        const response = await fetch(`${nimBaseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${nvidiaApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: model,
            messages: messages,
            response_format: jsonMode ? { type: "json_object" } : undefined,
            temperature: jsonMode ? 0.1 : 0.3,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`NVIDIA NIM API error (status ${response.status}): ${errorText}`);
        }

        const data = await response.json();
        if (!data.choices || data.choices.length === 0) {
          throw new Error("No completion choices returned from NVIDIA NIM.");
        }

        const content = data.choices[0].message.content || "";
        console.log(`[NVIDIA NIM] Successfully generated response using model: ${model}`);
        return content;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.warn(`[NVIDIA NIM] Model ${model} failed: ${errorMsg}. Trying next fallback model...`);
        lastError = err instanceof Error ? err : new Error(errorMsg);
      }
    }

    if (groqApiKey) {
      console.warn("[NVIDIA NIM] All NIM fallback models failed. Cascading to Groq...");
    } else {
      throw lastError || new Error("All NVIDIA NIM fallback models failed.");
    }
  }

  // 2. Fallback to Groq API
  if (groqApiKey) {
    let groqModel = activeModel;
    if (activeModel.includes("meta/llama-3.1-8b") || activeModel.includes("meta/llama3-8b")) {
      groqModel = "llama-3.1-8b-instant";
    } else if (activeModel.includes("70b") || activeModel.includes("llama-3.3")) {
      groqModel = "llama-3.3-70b-versatile";
    }

    const modelsToTry = [groqModel, "llama-3.1-8b-instant", "llama-3.3-70b-versatile"];
    let lastError: Error | null = null;

    for (const model of modelsToTry) {
      try {
        console.log(`[Groq] Attempting generation with model: ${model}`);
        
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${groqApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: model,
            messages: messages,
            response_format: jsonMode ? { type: "json_object" } : undefined,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Groq API error (status ${response.status}): ${errorText}`);
        }

        const data = await response.json();
        if (!data.choices || data.choices.length === 0) {
          throw new Error("No completion choices returned.");
        }

        const content = data.choices[0].message.content || "";
        console.log(`[Groq] Successfully generated response using model: ${model}`);
        return content;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.warn(`[Groq] Model ${model} failed: ${errorMsg}. Trying next fallback model...`);
        lastError = err instanceof Error ? err : new Error(errorMsg);
      }
    }

    throw lastError || new Error("All Groq fallback models failed.");
  }

  throw new Error("No API key configured for NVIDIA NIM or Groq.");
}

// Resilient API calling with backoff
async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const errorMsg = err.message;
    const isRateLimit = 
      errorMsg.includes("429") || 
      errorMsg.includes("503") || 
      errorMsg.includes("quota") || 
      errorMsg.includes("limit") || 
      errorMsg.includes("RESOURCE_EXHAUSTED") || 
      errorMsg.includes("UNAVAILABLE") || 
      errorMsg.includes("temporary");

    const isQuotaExceeded = 
      errorMsg.includes("exceeded your current quota") || 
      errorMsg.includes("Quota exceeded") || 
      errorMsg.includes("credits") || 
      errorMsg.includes("insufficient");

    if (retries > 0 && isRateLimit && !isQuotaExceeded) {
      console.warn(`Groq request rate limited/unavailable. Retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return retryWithBackoff(fn, retries - 1, delay * 2.5); // Exponential backoff
    }
    throw error;
  }
}

export async function summarizeThreadEmail(
  subject: string,
  sender: string,
  body: string,
  threadContext: string,
  modelName: string = "llama-3.1-8b-instant"
): Promise<SummaryResult> {
  const activeModel = resolveModelName(modelName);
  
  const systemInstruction = "You extract structured information from emails. Be concise, objective, and accurate.";
  const prompt = `You are an AI assistant processing emails for a personal inbox dashboard.
Analyze the following email in the context of its email thread history, generate a structured summary, categorizing it, and determining its importance and reply options.

Email Thread History (chronological):
${threadContext || "(No preceding thread messages)"}

Current Email to summarize (latest in the thread):
Sender: ${sender}
Subject: ${subject}
Body content:
${body.slice(0, 10000)}

You MUST respond with a JSON object containing the following keys (do not include any conversational intro/outro text, just the raw JSON):
- "shortSummary": A short, sweet, simple one-sentence summary (max 12 words) of the email, written in plain language.
- "detailedSummary": A bullet-pointed list of 2-3 short, clear key points (e.g. "• Item 1\n• Item 2"). Do not use long paragraphs.
- "actionItems": A list of actionable next steps directed at the recipient (array of strings, keep them short and concise, e.g. ["Call client at 3pm"]). Empty array [] if none.
- "category": The primary category for this email based on its intent. Choose exactly one: "Newsletters", "Job / Recruitment", "Finance", "Notifications", "Personal", "Work / Professional".
- "importanceScore": An urgency/importance rating from 1 (lowest) to 10 (highest). Rate it 8+ if it is highly urgent (requires immediate attention today).
- "replySuggestions": 3-4 contextual, short reply action options tailored specifically to this email (e.g. ["Confirm attendance", "Decline invitation"]). Max 4 options.
`;

  try {
    const responseText = await retryWithBackoff(() =>
      fetchLLM(
        [
          { role: "system", content: systemInstruction },
          { role: "user", content: prompt }
        ],
        activeModel,
        true
      )
    );

    if (!responseText) {
      throw new Error("Empty response from AI model");
    }

    const cleaned = cleanJsonResponse(responseText);
    const parsed = JSON.parse(cleaned) as any;
    
    // Ensure shortSummary is a string
    if (parsed.shortSummary !== undefined && typeof parsed.shortSummary !== "string") {
      parsed.shortSummary = String(parsed.shortSummary);
    }
    
    // Ensure detailedSummary is a string
    if (parsed.detailedSummary !== undefined) {
      if (typeof parsed.detailedSummary !== "string") {
        if (Array.isArray(parsed.detailedSummary)) {
          parsed.detailedSummary = parsed.detailedSummary
            .map((item: any) => {
              if (typeof item === "string") return item;
              if (item && typeof item === "object" && "text" in item) return String(item.text);
              return JSON.stringify(item);
            })
            .join("\n");
        } else if (typeof parsed.detailedSummary === "object" && parsed.detailedSummary !== null) {
          if ("text" in parsed.detailedSummary) {
            parsed.detailedSummary = String(parsed.detailedSummary.text);
          } else {
            parsed.detailedSummary = JSON.stringify(parsed.detailedSummary);
          }
        } else {
          parsed.detailedSummary = String(parsed.detailedSummary);
        }
      }
    } else {
      parsed.detailedSummary = "";
    }

    // Ensure category is a string
    if (parsed.category !== undefined && typeof parsed.category !== "string") {
      parsed.category = String(parsed.category);
    }

    // Ensure importanceScore is a number
    if (parsed.importanceScore !== undefined && typeof parsed.importanceScore !== "number") {
      const parsedNum = Number(parsed.importanceScore);
      parsed.importanceScore = isNaN(parsedNum) ? 5 : parsedNum;
    }

    // Ensure actionItems is a string array
    if (parsed.actionItems !== undefined) {
      if (!Array.isArray(parsed.actionItems)) {
        parsed.actionItems = typeof parsed.actionItems === "string" ? [parsed.actionItems] : [];
      } else {
        parsed.actionItems = parsed.actionItems.map((item: any) => typeof item === "string" ? item : JSON.stringify(item));
      }
    } else {
      parsed.actionItems = [];
    }

    // Ensure replySuggestions is a string array
    if (parsed.replySuggestions !== undefined) {
      if (!Array.isArray(parsed.replySuggestions)) {
        parsed.replySuggestions = typeof parsed.replySuggestions === "string" ? [parsed.replySuggestions] : [];
      } else {
        parsed.replySuggestions = parsed.replySuggestions.map((item: any) => typeof item === "string" ? item : JSON.stringify(item));
      }
    } else {
      parsed.replySuggestions = [];
    }

    return parsed as SummaryResult;
  } catch (error) {
    console.error("Groq summarization failed after retries:", error);
    return {
      shortSummary: "Failed to summarize email.",
      detailedSummary: "The AI model encountered an error while processing this message.",
      actionItems: [],
      category: "Updates",
      importanceScore: 1,
      replySuggestions: []
    };
  }
}

export async function askAgentAboutEmails(
  query: string,
  emailContext: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
  modelName: string = "llama-3.1-8b-instant",
  isNewsletterQuery: boolean = false
): Promise<string> {
  const activeModel = resolveModelName(modelName);
  
  let systemInstruction = `You are a knowledgeable personal email assistant that has read all of the user's emails.
Your task is to answer user queries using the provided email context as your EXCLUSIVE knowledge base.

CRITICAL SAFETY RULES (ZERO HALLUCINATIONS):
1. STRICT GROUNDING: You must ONLY use facts, dates, names, links, and figures that are EXPLICITLY stated in the provided Email Context. Under no circumstances should you use external pre-trained knowledge, speculate, make assumptions, or extrapolate beyond the text.
2. SOURCE CLARITY: For every claim, fact, or summary you write, you must explicitly state which email or thread the information came from, citing the Sender, Date, and Subject line.
3. CONTEXT LIMITS: If the query asks about details, events, projects, or senders that are not present in the provided Email Context, you MUST respond: "I cannot find any information about this in your synced emails." Do not try to answer using outside knowledge or assumptions.
4. NO SPECULATION: If an email states that something might happen, state it as a possibility, not a fact. If the details are vague in the emails, state that they are vague. Do not fill in the gaps.
5. CONVERSATIONAL HISTORY: Keep the conversation history in mind for follow-up questions, but apply the same strict context rules to all responses.`;

  if (isNewsletterQuery) {
    systemInstruction = `You are a knowledgeable personal email assistant specializing in creating unified news digests from the user's newsletters.
Your task is to analyze the provided newsletter email context and generate a clean, unified news digest/update.

CRITICAL SAFETY RULES (ZERO HALLUCINATIONS):
1. STRICT GROUNDING: You must ONLY include news stories, details, links, and facts that are EXPLICITLY stated in the provided newsletter context. Under no circumstances should you add details from your pre-trained knowledge base, external news, or speculate about current events.
2. IDENTIFY OVERLAPPING STORIES: Recognize that multiple different newsletter sources (e.g. TLDR, ByteByteGo, Cooperpress) may cover the same news story.
3. SEMANTIC DEDUPLICATION: Group and deduplicate the news items/stories based on semantic similarity (meaning and topic similarity, NOT just exact title matching).
4. PRESENT A CLEAN, UNIFIED LIST: Present each unique news story/topic ONLY ONCE in the final digest.
5. SOURCE ATTRIBUTION: For each unique story, clearly list and attribute all original newsletter source(s) that reported on it. Format the attribution clearly (e.g. 'Source(s): TLDR (Jun 18), ByteByteGo (Jun 17)').
6. CONTEXT LIMITS: If the newsletter context is empty, or does not contain any newsletters, respond: "No recent newsletters found to summarize." Do not invent any news stories.`;
  }

  const currentPrompt = `Retrieved Email Context:
${emailContext}

User Query: ${query}
`;

  const messages = [
    { role: "system", content: systemInstruction },
    ...history.map(msg => ({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: msg.content
    })),
    { role: "user", content: currentPrompt }
  ];

  try {
    const responseText = await retryWithBackoff(() =>
      fetchLLM(messages, activeModel, false)
    );

    return responseText || "I was unable to generate an answer.";
  } catch (error) {
    console.error("AI Chat Agent failed after retries:", error);
    return "Error: I encountered a problem communicating with the AI agent.";
  }
}

export async function draftReply(
  subject: string,
  sender: string,
  threadContext: string,
  userInstruction: string,
  userName: string = "User",
  modelName: string = "llama-3.1-8b-instant"
): Promise<DraftResult> {
  const activeModel = resolveModelName(modelName);
  
  const systemInstruction = "You draft email replies. Return a structured JSON response with a subject line (usually starting with Re:) and a body content that includes a friendly regards sign-off at the end using the user's name. You must strictly base the reply content on the provided thread context and the user's instruction. Do not invent any meetings, dates, names, or outside facts that are not present in the context or user's instructions.";
  const prompt = `You are a personal assistant. Help draft a reply to an email thread based on the user's instructions.
  
Original Email Thread Context:
${threadContext}

User Instruction for the reply:
${userInstruction}

User's Name (for signature/regards):
${userName}

You MUST respond with a JSON object containing (do not include any conversational intro/outro text, just the raw JSON):
- "subject": A suitable reply subject line (usually starts with Re:).
- "body": The complete email body content, ending with a professional sign-off (e.g. Regards, [User's Name]).
`;

  try {
    const responseText = await retryWithBackoff(() =>
      fetchLLM(
        [
          { role: "system", content: systemInstruction },
          { role: "user", content: prompt }
        ],
        activeModel,
        true
      )
    );

    if (!responseText) {
      throw new Error("Empty response from AI model");
    }

    const cleaned = cleanJsonResponse(responseText);
    return JSON.parse(cleaned) as DraftResult;
  } catch (error) {
    console.error("Groq Draft Writer failed after retries:", error);
    return {
      subject: subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`,
      body: `Hi,\n\nI received your email regarding "${subject}". I will review the details and get back to you shortly.\n\nRegards,\n${userName}`
    };
  }
}
