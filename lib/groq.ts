import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
  timeout: 8_000,
});

export default groq;

export async function askGroq(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 500
): Promise<string> {
  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: maxTokens,
      temperature: 0.3,
    });
    return completion.choices[0]?.message?.content || '';
  } catch (error) {
    console.error('Groq error:', error);
    return '';
  }
}

export async function askGroqJSON(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 500
): Promise<Record<string, unknown> | null> {
  try {
    const text = await askGroq(
      systemPrompt + '\n\nRespond with valid JSON only. No explanation, no markdown.',
      userMessage,
      maxTokens
    );
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

/**
 * Structured JSON output from Groq with schema guidance.
 * Returns typed result or null on failure.
 *
 * - Retries once on malformed response
 * - Never throws uncaught errors
 * - Timeout-safe (inherits 8s SDK timeout)
 */
export async function askGroqStructured<T>(options: {
  systemPrompt: string;
  userMessage: string;
  schemaName: string;
  schema: object;
  maxTokens?: number;
}): Promise<T | null> {
  const { systemPrompt, userMessage, schemaName, schema, maxTokens = 500 } = options;

  const schemaHint = `\n\nYou MUST respond with valid JSON matching this schema (${schemaName}):\n${JSON.stringify(schema)}\nNo explanation, no markdown, no extra text.`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await askGroq(
        systemPrompt + schemaHint,
        userMessage,
        maxTokens
      );

      if (!text) return null;

      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean) as T;
      return parsed;
    } catch {
      if (attempt === 0) {
        // Retry once on parse failure
        continue;
      }
      return null;
    }
  }

  return null;
}
