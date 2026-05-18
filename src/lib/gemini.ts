import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Thin wrapper around Google's Generative AI SDK for the /expo demo.
 * Two model targets:
 *   - flash: gemini-2.5-flash — speed/low-latency for live stage demo
 *   - pro:   gemini-2.5-pro   — deeper reasoning for the investigator brief
 *
 * Reads GEMINI_API_KEY at call time (not module-load) so importing this file
 * in routes that don't actually call Gemini stays safe in environments where
 * the key isn't set (e.g. preview deploys without the secret yet).
 */

export type GeminiModel = "flash" | "pro";

const MODEL_IDS: Record<GeminiModel, string> = {
  flash: "gemini-2.5-flash",
  pro: "gemini-2.5-pro",
};

function getClient(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey and add it to .env.local.",
    );
  }
  return new GoogleGenerativeAI(key);
}

export async function geminiText(
  prompt: string,
  opts: { model?: GeminiModel; systemInstruction?: string } = {},
): Promise<string> {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: MODEL_IDS[opts.model ?? "flash"],
    systemInstruction: opts.systemInstruction,
  });
  const r = await model.generateContent(prompt);
  return r.response.text();
}

export async function geminiJson<T>(
  prompt: string,
  opts: { model?: GeminiModel; systemInstruction?: string } = {},
): Promise<T> {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: MODEL_IDS[opts.model ?? "flash"],
    systemInstruction: opts.systemInstruction,
    generationConfig: { responseMimeType: "application/json" },
  });
  const r = await model.generateContent(prompt);
  const text = r.response.text();
  return JSON.parse(text) as T;
}
