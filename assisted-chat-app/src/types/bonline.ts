export type BonlineCallOutcome = 'unknown' | 'ringing' | 'answered' | 'missed';
export type BonlineFollowUpAction = 'claim' | 'release' | 'resolve';

export interface BonlineFollowUp {
  status: 'pending' | 'claimed' | 'resolved';
  assignedTo: string | null;
  claimedAt: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BonlineManagedCall {
  id: string;
  callId: string;
  phone: string | null;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  firstReceivedAt: string;
  lastReceivedAt: string;
  outcome: BonlineCallOutcome;
  followUp: BonlineFollowUp | null;
}

export interface BonlineCallsResponse {
  enabled: boolean;
  currentAdminId: string;
  calls: BonlineManagedCall[];
  nextCursor: string | null;
}

export interface BonlineAnalyticsResponse {
  enabled: boolean;
  period: { days: number; from: string; to: string };
  metrics: {
    totalCalls: number;
    answeredCalls: number;
    missedCalls: number;
    unknownCalls: number;
    openFollowUps: number;
    overdueFollowUps: number;
    linkedQuotes: number;
    linkedBookings: number;
    paidBookings: number;
    paidRevenuePence: number;
    quoteConversionRate: number | null;
    bookingConversionRate: number | null;
  };
  currency: 'GBP';
}

export interface BonlineAttributionContext {
  phone: string;
  bookingId?: string;
  quoteId?: string;
}

export interface BonlineOutboundCapability {
  enabled: boolean;
  reason: string;
  message: string;
}

export interface BonlineOutboundResult {
  attemptId: string;
  status: 'accepted' | 'pending' | 'unknown' | 'failed';
  message: string;
  replayed: boolean;
}
