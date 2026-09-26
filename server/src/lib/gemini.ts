// ============================================================
// GK TRAVELS CRM — Gemini AI client
//
// Thin wrapper around the Gemini API (free tier). The model is GEMINI_MODEL,
// or `gemini-flash-lite-latest`: the alias every key can call (some keys get
// 404 on pinned names such as gemini-2.5-flash-lite).
// AI is used server-side only to generate structured text from
// data already in the database — never to invent facts.
// ============================================================

import { GoogleGenerativeAI } from '@google/generative-ai';

// The client is built on first use, never at import time. AI is an optional
// feature: throwing here would propagate up the import chain
// (app.ts → routes/ai.ts → aiMessageService.ts → here) and prevent the whole
// Express app from being constructed, taking down login and every other
// endpoint because one optional key was missing.
let genAI: GoogleGenerativeAI | null = null;

export const DEFAULT_GEMINI_MODEL = 'gemini-flash-lite-latest';

/** The Gemini model to call: `GEMINI_MODEL` when set, else the alias every key can use. */
export function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

/** True when the Gemini API key is configured — routes use this to return 503. */
export function isAiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function getClient(): GoogleGenerativeAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('AI is not configured — GEMINI_API_KEY is not set');
  }
  genAI ??= new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI;
}

export async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 1000,
): Promise<string> {
  try {
    const model = getClient().getGenerativeModel({
      model: geminiModel(),
      systemInstruction: systemPrompt,
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: 0.7,
      },
    });

    const result   = await model.generateContent(userPrompt);
    const response  = result.response;
    const text      = response.text();

    if (!text) {
      throw new Error('Gemini returned empty response');
    }

    return text;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Gemini API error: ${message}`);
  }
}
