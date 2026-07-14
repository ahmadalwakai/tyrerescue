export const ADMIN_QUOTE_STATUSES = [
  'DRAFT',
  'QUOTED',
  'CONFIRMED_BY_PHONE',
  'PAYMENT_PENDING',
  'PAID',
  'EXPIRED',
  'CANCELLED',
] as const;

export type AdminQuoteStatus = (typeof ADMIN_QUOTE_STATUSES)[number];

export const ADMIN_QUOTE_PAYMENT_OPTIONS = [
  'FULL_PAYMENT',
  'DEPOSIT_20',
  'DEPOSIT_15',
  'CASH_ON_ARRIVAL',
  'PAYMENT_LINK',
] as const;

export type AdminQuotePaymentOption = (typeof ADMIN_QUOTE_PAYMENT_OPTIONS)[number];

export const ADMIN_QUOTE_NEXT_ACTIONS = [
  'TAKE_FULL_PAYMENT',
  'TAKE_DEPOSIT',
  'MARK_CASH_PENDING',
  'SEND_PAYMENT_LINK',
  'ALREADY_CONFIRMED',
  'RECALCULATE_REQUIRED',
] as const;

export type AdminQuoteNextAction = (typeof ADMIN_QUOTE_NEXT_ACTIONS)[number];

export type AdminQuoteConfirmationMethod = 'PHONE';

export interface AdminQuoteTyreLineInput {
  id?: string | null;
  size: string;
  quantity: number;
  brand?: string | null;
  pattern?: string | null;
  season?: string | null;
  source?: string | null;
  price?: number | null;
}

export interface AdminQuoteListItem {
  id: string;
  quoteRef: string;
  customerName: string | null;
  customerPhone: string | null;
  address: string | null;
  postcode: string | null;
  latitude: number | null;
  longitude: number | null;
  tyreSize: string | null;
  quantity: number;
  lockingWheelNutStatus: string | null;
  lockingWheelNutChargePence: number | null;
  priceAmount: number;
  currency: 'GBP';
  quoteStatus: AdminQuoteStatus;
  isExpired: boolean;
  expiresAt: string;
  confirmedAt: string | null;
  confirmationMethod: AdminQuoteConfirmationMethod | null;
  selectedPaymentOption: AdminQuotePaymentOption | null;
  quickBookingId: string | null;
  createdByAdminId: string | null;
  internalNotes: string | null;
  createdAt: string;
  updatedAt: string;
  whatsappMessage: string;
  confirmationWhatsAppMessages: Record<AdminQuotePaymentOption, string>;
  smsAvailable: boolean;
  smsUnavailableReason: string | null;
}

export type AdminQuote = AdminQuoteListItem;

export interface CreateAdminQuoteInput {
  quickBookingId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  address?: string | null;
  postcode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  tyreSize?: string | null;
  quantity?: number;
  tyreLines?: AdminQuoteTyreLineInput[];
  items?: AdminQuoteTyreLineInput[];
  lockingWheelNutStatus?: string | null;
  lockingWheelNutChargePence?: number | null;
  priceAmount?: number;
  currency?: 'GBP';
  quoteStatus?: AdminQuoteStatus;
  expiresAt?: string;
  internalNotes?: string | null;
}

export interface UpdateAdminQuoteInput {
  quickBookingId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  address?: string | null;
  postcode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  tyreSize?: string | null;
  quantity?: number;
  tyreLines?: AdminQuoteTyreLineInput[];
  items?: AdminQuoteTyreLineInput[];
  lockingWheelNutStatus?: string | null;
  lockingWheelNutChargePence?: number | null;
  priceAmount?: number;
  quoteStatus?: AdminQuoteStatus;
  expiresAt?: string;
  internalNotes?: string | null;
  refreshPrice?: boolean;
}

export interface ConfirmAdminQuoteInput {
  selectedPaymentOption: AdminQuotePaymentOption;
  operatorNote?: string | null;
  idempotencyKey?: string | null;
}

export interface AdminQuotePaymentSummary {
  totalAmountPence: number;
  formattedTotal: string;
  depositAmountPence: number | null;
  formattedDeposit: string | null;
  remainingBalancePence: number | null;
  formattedRemaining: string | null;
}

export interface AdminQuotePaymentHandoff {
  canStartPayment: boolean;
  paymentUrl: string | null;
  clientSecret: string | null;
  message: string;
}

export interface ConfirmAdminQuoteResponse {
  quote: AdminQuote;
  nextAction: AdminQuoteNextAction;
  selectedPaymentOption: AdminQuotePaymentOption | null;
  alreadyConfirmed: boolean;
  paymentSummary: AdminQuotePaymentSummary;
  whatsappMessage: string;
  paymentInstruction: string | null;
  paymentHandoff: AdminQuotePaymentHandoff;
}

export interface AdminQuoteListResponse {
  quotes: AdminQuoteListItem[];
  limit: number;
}

export interface AdminQuoteResponse {
  quote: AdminQuote;
}
