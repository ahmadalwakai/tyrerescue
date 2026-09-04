export interface CollectedData {
  intent?: 'emergency' | 'enquiry' | 'other';
  vehicleReg?: string;
  location?: string;
  problem?: string;
}

export interface TranscriptEntry {
  role: 'ai' | 'customer';
  text: string;
  step: number;
  ts: string;
}

export interface ExtractionResult<T = string> {
  value: T | null;
  confident: boolean;
}

export const CONVERSATION_STEPS = {
  GREETING: 0,
  COLLECT_REG: 1,
  COLLECT_LOCATION: 2,
  COLLECT_PROBLEM: 3,
  CONFIRM: 4,
  COMPLETE: 5,
} as const;

export type ConversationStep = (typeof CONVERSATION_STEPS)[keyof typeof CONVERSATION_STEPS];
