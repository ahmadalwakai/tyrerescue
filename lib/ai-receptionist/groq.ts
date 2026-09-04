import 'server-only';
import { askGroqStructured } from '@/lib/groq';
import type { CollectedData, ExtractionResult } from './types';

const BASE_SYSTEM =
  'You are an AI phone receptionist for Tyre Rescue, a UK mobile emergency tyre fitting service. '
  + 'Extract information from speech-to-text transcripts. Speech recognition may make errors — be lenient. '
  + 'Always respond with valid JSON only.';

interface IntentResult {
  intent: 'emergency' | 'enquiry' | 'other';
  confident: boolean;
}

export async function extractIntent(speech: string): Promise<IntentResult> {
  const result = await askGroqStructured<IntentResult>({
    schemaName: 'IntentExtraction',
    schema: {
      type: 'object',
      properties: {
        intent: { type: 'string', enum: ['emergency', 'enquiry', 'other'] },
        confident: { type: 'boolean' },
      },
      required: ['intent', 'confident'],
    },
    maxTokens: 60,
    systemPrompt: BASE_SYSTEM,
    userMessage: `Customer said: "${speech}"\n\nIs this an emergency tyre issue (flat, blowout, puncture on road) or a general enquiry? Return intent as "emergency" for anything urgent.`,
  });
  return result ?? { intent: 'emergency', confident: false };
}

export async function extractVehicleReg(speech: string): Promise<ExtractionResult<string>> {
  const result = await askGroqStructured<ExtractionResult<string>>({
    schemaName: 'RegExtraction',
    schema: {
      type: 'object',
      properties: {
        value: { type: ['string', 'null'] },
        confident: { type: 'boolean' },
      },
      required: ['value', 'confident'],
    },
    maxTokens: 80,
    systemPrompt:
      BASE_SYSTEM
      + ' Extract the UK vehicle registration number. '
      + 'UK plates look like AB12CDE, AB12 CDE, older ones like A123 BCD. '
      + 'Fix common STT errors: "Alpha" → A, "Bravo" → B, "one two" → 12, etc. '
      + 'Return the reg WITHOUT spaces in uppercase. Return null if not found.',
    userMessage: `Customer said: "${speech}"`,
  });
  return result ?? { value: null, confident: false };
}

export async function extractLocation(speech: string): Promise<ExtractionResult<string>> {
  const result = await askGroqStructured<ExtractionResult<string>>({
    schemaName: 'LocationExtraction',
    schema: {
      type: 'object',
      properties: {
        value: { type: ['string', 'null'] },
        confident: { type: 'boolean' },
      },
      required: ['value', 'confident'],
    },
    maxTokens: 80,
    systemPrompt:
      BASE_SYSTEM
      + ' Extract the UK location or postcode from customer speech. '
      + 'Keep as they said it but fix obvious STT errors. Return null if unclear.',
    userMessage: `Customer said: "${speech}"`,
  });
  return result ?? { value: speech.trim().slice(0, 80) || null, confident: false };
}

export async function extractProblem(speech: string): Promise<ExtractionResult<string>> {
  const result = await askGroqStructured<ExtractionResult<string>>({
    schemaName: 'ProblemExtraction',
    schema: {
      type: 'object',
      properties: {
        value: { type: ['string', 'null'] },
        confident: { type: 'boolean' },
      },
      required: ['value', 'confident'],
    },
    maxTokens: 80,
    systemPrompt:
      BASE_SYSTEM
      + ' Extract the tyre problem from speech. Normalize to clear English. '
      + 'Common issues: flat tyre, puncture, blowout, slow puncture, run flat, bead leak. '
      + 'If unclear return what they said.',
    userMessage: `Customer said: "${speech}"`,
  });
  return result ?? { value: speech.trim().slice(0, 120) || null, confident: true };
}

export async function extractConfirmation(speech: string): Promise<boolean> {
  const result = await askGroqStructured<{ confirmed: boolean }>({
    schemaName: 'ConfirmationExtraction',
    schema: {
      type: 'object',
      properties: { confirmed: { type: 'boolean' } },
      required: ['confirmed'],
    },
    maxTokens: 30,
    systemPrompt: BASE_SYSTEM + ' Did the customer say yes/confirm, or no/deny?',
    userMessage: `Customer said: "${speech}"`,
  });
  return result?.confirmed ?? true;
}

export function buildConfirmationText(data: CollectedData, callerNumber: string): string {
  const reg = data.vehicleReg ?? 'unknown registration';
  const location = data.location ?? 'unknown location';
  const problem = data.problem ?? 'tyre issue';
  const phone = callerNumber.replace(/^\+44/, '0');
  return `Perfect. Just to confirm — I have a ${problem} for vehicle ${reg.split('').join(' ')} at ${location}. We'll call you back on ${phone}. Is that correct?`;
}
