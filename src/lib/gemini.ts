import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface SummaryResult {
  shortSummary: string;
  detailedSummary: string;
  actionItems: string[];
  category: string;
  importanceScore: number;
}

// Helper to resolve model names based on availability
function resolveModelName(modelName: string): string {
  if (modelName === "gemini-1.5-flash" || !modelName) {
    return "gemini-3.5-flash";
  }
  return modelName;
}

export async function summarizeEmail(
  subject: string,
  sender: string,
  body: string,
  modelName: string = "gemini-3.5-flash"
): Promise<SummaryResult> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set in environment variables.");
  }

  const activeModel = resolveModelName(modelName);
  const prompt = `You are an AI assistant processing emails for a personal inbox dashboard.
Analyze the following email and generate a structured summary, categorizing it, and determining its importance.

Sender: ${sender}
Subject: ${subject}
Body content:
${body.slice(0, 10000)}
`;

  try {
    const response = await ai.models.generateContent({
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
              enum: ["Important", "Promotions", "Finance", "Social", "Updates"],
              description: "The primary category for this email."
            },
            importanceScore: {
              type: Type.INTEGER,
              description: "An urgency/importance rating from 1 (lowest) to 10 (highest, e.g. from manager, urgent bank notices)."
            }
          },
          required: ["shortSummary", "detailedSummary", "actionItems", "category", "importanceScore"]
        }
      }
    });

    if (!response.text) {
      throw new Error("Empty response from Gemini API");
    }

    return JSON.parse(response.text) as SummaryResult;
  } catch (error) {
    console.error("Gemini summarization failed:", error);
    return {
      shortSummary: "Failed to summarize email.",
      detailedSummary: "The AI model encountered an error while processing this message.",
      actionItems: [],
      category: "Updates",
      importanceScore: 1
    };
  }
}

export async function askAgentAboutEmails(
  query: string,
  emailContext: string,
  modelName: string = "gemini-3.5-flash"
): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set in environment variables.");
  }

  const activeModel = resolveModelName(modelName);
  const prompt = `You are a personal Gmail assistant. Answer the user's query using the retrieved email context provided below.
If the query cannot be answered with the provided context, state that you don't have enough context.
Make your response conversational, and cite specific email details (Sender, Date, Subject) when answering.

Retrieved Email Context:
${emailContext}

User Query: ${query}
`;

  try {
    const response = await ai.models.generateContent({
      model: activeModel,
      contents: prompt,
      config: {
        systemInstruction: "You are a helpful, secure personal email assistant. You only answer questions based on the provided email context."
      }
    });

    return response.text || "I was unable to generate an answer.";
  } catch (error) {
    console.error("Gemini Chat Agent failed:", error);
    return "Error: I encountered a problem communicating with the AI agent.";
  }
}

export async function draftReply(
  subject: string,
  sender: string,
  threadContext: string,
  userInstruction: string,
  modelName: string = "gemini-3.5-flash"
): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set in environment variables.");
  }

  const activeModel = resolveModelName(modelName);
  const prompt = `You are a personal assistant. Help draft a reply to an email thread based on the user's instructions.
  
Original Email Thread Context:
${threadContext}

User Instruction for the reply:
${userInstruction}

Provide ONLY the text of the email draft. Do not include subject lines, signatures, or placeholders like [Your Name] unless specifically requested. Start writing the email body directly.
`;

  try {
    const response = await ai.models.generateContent({
      model: activeModel,
      contents: prompt,
      config: {
        systemInstruction: "You draft professional, clear email replies based strictly on the user's directions and thread context."
      }
    });

    return response.text || "Failed to generate email draft.";
  } catch (error) {
    console.error("Gemini Draft Writer failed:", error);
    return "Error generating draft.";
  }
}
