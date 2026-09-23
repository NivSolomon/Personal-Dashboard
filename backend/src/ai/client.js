import OpenAI from 'openai';
import { config } from '../config.js';

let client = null;

/** One SDK client for the process: shared timeout and retry budget. */
export function getOpenAiClient() {
  if (!client) {
    client = new OpenAI({
      apiKey: config.openai.apiKey,
      timeout: 25_000,
      maxRetries: 1,
    });
  }
  return client;
}
