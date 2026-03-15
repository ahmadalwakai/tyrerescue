import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export default groq;

export async function askGroq(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 500
): Promise<string> {
  try {
    const completion = await groq.chat.completions.create({
      model: 'llama3-8b-8192',
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
