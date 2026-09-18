import OpenAI from "openai";

export const OPENAI_MODEL = "gpt-5.6-luna";

export function getOpenAI(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}