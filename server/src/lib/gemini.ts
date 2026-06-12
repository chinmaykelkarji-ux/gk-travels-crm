// ============================================================
// GK TRAVELS CRM — Gemini AI client
//
// Thin wrapper around the Gemini API (free tier, gemini-2.5-flash-lite).
// AI is used server-side only to generate structured text from
// data already in the database — never to invent facts.
// ============================================================

import { GoogleGenerativeAI } from '@google/generative-ai';

if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY is required');
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 1000,
): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
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
