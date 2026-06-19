import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface SummaryResult {
  shortSummary: string;
  detailedSummary: string;
  actionItems: string[];
  category: string;
  importanceScore: number;
  replySuggestions: string[];
}

// Helper to resolve model names based on availability
function resolveModelName(modelName: string): string {
  // Map invalid/unavailable model names to gemini-2.5-flash (correct free-tier model)
  if (
    modelName === "gemini-2.0-flash-lite" ||
    modelName === "gemini-1.5-flash" ||
    !modelName
  ) {
    return "gemini-2.5-flash";
  }
  return modelName;
}

// Resilient API calling with backoff
async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 4, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const status = (error as { status?: number })?.status;
    const errorMsg = err.message;
    const isRateLimit = 
      status === 429 || 
      status === 503 ||
      errorMsg.includes("429") || 
      errorMsg.includes("503") || 
      errorMsg.includes("quota") || 
      errorMsg.includes("RESOURCE_EXHAUSTED") || 
      errorMsg.includes("UNAVAILABLE") || 
      errorMsg.includes("high demand") || 
      errorMsg.includes("temporary");
    
    const isQuotaExceeded = 
      errorMsg.includes("exceeded your current quota") || 
      errorMsg.includes("Quota exceeded") || 
      errorMsg.includes("RESOURCE_EXHAUSTED");

    if (retries > 0 && isRateLimit && !isQuotaExceeded) {
      console.warn(`Gemini API rate limited/unavailable. Retrying in ${delay}ms... (${retries} retries left)`);
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
  modelName: string = "gemini-3.5-flash"
): Promise<SummaryResult> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set in environment variables.");
  }

  const activeModel = resolveModelName(modelName);
  const prompt = `You are an AI assistant processing emails for a personal inbox dashboard.
Analyze the following email in the context of its email thread history, generate a structured summary, categorizing it, and determining its importance and reply options.

Email Thread History (chronological):
${threadContext || "(No preceding thread messages)"}

Current Email to summarize (latest in the thread):
Sender: ${sender}
Subject: ${subject}
Body content:
${body.slice(0, 10000)}
`;

  try {
    const response = await retryWithBackoff(() =>
      ai.models.generateContent({
        model: activeModel,
        contents: prompt,
        config: {
          systemInstruction: "You extract structured information from emails. Be concise, objective, and accurate.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              shortSummary: { 
                type: Type.STRING, 
                description: "A one-sentence summary (max 15 words) of the email." 
              },
              detailedSummary: { 
                type: Type.STRING, 
                description: "A short paragraph or bullet points detailing the key context and points." 
              },
              actionItems: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "A list of actionable steps or questions directed at the recipient. Empty array if none."
              },
              category: {
                type: Type.STRING,
                enum: ["Newsletters", "Job / Recruitment", "Finance", "Notifications", "Personal", "Work / Professional"],
                description: "The primary category for this email based on its intent and source."
              },
              importanceScore: {
                type: Type.INTEGER,
                description: "An urgency/importance rating from 1 (lowest) to 10 (highest, e.g. from manager, urgent bank notices)."
              },
              replySuggestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "3-4 contextual, short reply action options tailored specifically to this email (e.g., 'Confirm attendance', 'Decline invitation', 'Ask for invoice details'). Max 4 options."
              }
            },
            required: ["shortSummary", "detailedSummary", "actionItems", "category", "importanceScore", "replySuggestions"]
          }
        }
      })
    );

    if (!response.text) {
      throw new Error("Empty response from Gemini API");
    }

    return JSON.parse(response.text) as SummaryResult;
  } catch (error) {
    console.error("Gemini summarization failed after retries:", error);
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
  modelName: string = "gemini-3.5-flash",
  isNewsletterQuery: boolean = false
): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set in environment variables.");
  }

  const activeModel = resolveModelName(modelName);
  
  // Format the user query + email context for the current turn
  const currentPrompt = `Retrieved Email Context:
${emailContext}

User Query: ${query}
`;

  // Build conversational content structure for the Google GenAI SDK
  const contents = [
    ...history.map(msg => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }]
    })),
    {
      role: "user",
      parts: [{ text: currentPrompt }]
    }
  ];

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

  try {
    const response = await retryWithBackoff(() =>
      ai.models.generateContent({
        model: activeModel,
        contents: contents,
        config: {
          systemInstruction: systemInstruction
        }
      })
    );

    return response.text || "I was unable to generate an answer.";
  } catch (error) {
    console.error("Gemini Chat Agent failed after retries:", error);
    return "Error: I encountered a problem communicating with the AI agent.";
  }
}

export interface DraftResult {
  subject: string;
  body: string;
}

export async function draftReply(
  subject: string,
  sender: string,
  threadContext: string,
  userInstruction: string,
  userName: string = "User",
  modelName: string = "gemini-3.5-flash"
): Promise<DraftResult> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set in environment variables.");
  }

  const activeModel = resolveModelName(modelName);
  const prompt = `You are a personal assistant. Help draft a reply to an email thread based on the user's instructions.
  
Original Email Thread Context:
${threadContext}

User Instruction for the reply:
${userInstruction}

User's Name (for signature/regards):
${userName}
`;

  try {
    const response = await retryWithBackoff(() =>
      ai.models.generateContent({
        model: activeModel,
        contents: prompt,
        config: {
          systemInstruction: "You draft email replies. Return a structured JSON response with a subject line (usually starting with Re:) and a body content that includes a friendly regards sign-off at the end using the user's name. You must strictly base the reply content on the provided thread context and the user's instruction. Do not invent any meetings, dates, names, or outside facts that are not present in the context or user's instructions.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              subject: { 
                type: Type.STRING, 
                description: "A suitable reply subject line (e.g. Re: subject)." 
              },
              body: { 
                type: Type.STRING, 
                description: "The complete email body content, ending with a professional sign-off (e.g. Regards, [User's Name])." 
              }
            },
            required: ["subject", "body"]
          }
        }
      })
    );

    if (!response.text) {
      throw new Error("Empty response from Gemini API");
    }

    return JSON.parse(response.text) as DraftResult;
  } catch (error) {
    console.error("Gemini Draft Writer failed after retries:", error);
    return {
      subject: subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`,
      body: `Hi,\n\nI received your email regarding "${subject}". I will review the details and get back to you shortly.\n\nRegards,\n${userName}`
    };
  }
}
