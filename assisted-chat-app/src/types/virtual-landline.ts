export type VirtualLandlineDirection = 'incoming' | 'outgoing' | 'missed' | 'unknown';

export interface VirtualLandlineDetectedColumns {
  callerNumber?: string;
  destinationNumber?: string;
  direction?: string;
  startTime?: string;
  date?: string;
  time?: string;
  endTime?: string;
  duration?: string;
  callStatus?: string;
  recordingUrl?: string;
  providerCallId?: string;
}

export interface VirtualLandlinePreviewRow {
  importKey: string;
  direction: VirtualLandlineDirection;
  callStatus: string;
  callerNumberRaw: string | null;
  destinationNumberRaw: string | null;
  customerPhoneNormalized: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  recordingUrl: string | null;
  sourceRowNumber: number;
}

export interface VirtualLandlinePreviewResponse {
  state: 'empty_history' | 'invalid_csv' | 'partial_preview' | 'ready';
  fileName: string;
  headers: string[];
  detectedColumns: VirtualLandlineDetectedColumns;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  missedRows: number;
  counts: {
    incoming: number;
    outgoing: number;
    missed: number;
    unknown: number;
    recordingRows: number;
    withheldRows: number;
  };
  previewRows: VirtualLandlinePreviewRow[];
  invalidSamples: Array<{ rowNumber: number; reason: string; rawRow: Record<string, string> }>;
  duplicateSamples: Array<{ rowNumber: number; reason: string; rawRow: Record<string, string> }>;
  warningSamples: Array<{ rowNumber: number; reason: string; rawRow: Record<string, string> }>;
}

export interface VirtualLandlineImportResponse {
  state: 'succeeded' | 'partially_succeeded' | 'duplicate_rows';
  fileName: string;
  imported: number;
  skipped: number;
  duplicate: number;
  invalid: number;
  missedCalls: number;
  missedInteractionIds: string[];
}

export interface VirtualLandlineInteraction {
  id: string;
  direction: VirtualLandlineDirection;
  callStatus: string;
  callerNumberRaw: string | null;
  destinationNumberRaw: string | null;
  customerPhoneNormalized: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  costRaw: string | null;
  recordingUrl: string | null;
  reviewed: boolean;
  matchedCustomer: { id: string; name: string | null; email: string | null; phone: string | null } | null;
  linkedBooking: { id: string; refNumber: string | null } | null;
  linkedQuickBooking: { id: string; bookingId: string | null; customerName: string | null } | null;
}

export interface VirtualLandlineInteractionsResponse {
  items: VirtualLandlineInteraction[];
  page: number;
  perPage: number;
  totalCount: number;
  totalPages: number;
  pendingMissedCount: number;
  previewMode?: boolean;
  message?: string;
}

export interface VirtualLandlineDraftResponse {
  draft: {
    phone: string;
    interactionId: string;
    matchedCustomer: {
      id: string | null;
      name: string | null;
      email: string | null;
      phone: string | null;
      source: 'user' | 'booking' | 'quick_booking';
    } | null;
  };
}
