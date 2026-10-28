import type { AssistedChatDraft, AssistedChatServiceType } from '../types/assisted-chat';
import { createBookingTyreLine, normalizeAssistedChatTyreSize } from './assisted-chat-workflow';

export const MAX_CALL_TRANSCRIPT_LENGTH = 12_000;

export interface CallBookingReview {
  locationAddress: string;
  tyreSize: string;
  problem: string;
  serviceType: AssistedChatServiceType;
  useLocation: boolean;
  useTyreSize: boolean;
  useProblem: boolean;
}

const STAFF = /^(?:agent|operator|admin|assistant|advisor|adviser|الموظف|المسؤول|الأدمن)\s*:/i;
const CUSTOMER = /^(?:customer|caller|client|العميل|المتصل)\s*:\s*/i;
const QUESTION = /[?؟]\s*$|^(?:is|are|do|does|did|can|could|would|what|where|which|هل|أين|ما هو)\s/i;
const ISSUE = /\b(?:puncture(?:d)?|flat\s+(?:tyre|tire)|(?:tyre|tire)\s+(?:is\s+)?flat|blowout|blown\s+(?:tyre|tire)|(?:tyre|tire)\s+(?:has\s+)?burst|losing\s+(?:air|pressure)|slow\s+leak|nail|screw|sidewall|locking\s+(?:wheel\s+)?nut)\b|(?:بنشر|مثقوب|انفجر|منفجر|مسمار|تسريب|تسرب|الإطار فارغ|الاطار فارغ|الكفر فارغ)/i;
const NEGATED_ISSUE = /\b(?:no|not|never|without|isn't|isn’t|isnt|hasn't|hasn’t|doesn't|doesn’t|don't|don’t)\b.{0,30}\b(?:puncture|flat|blowout|leak|nail|screw|losing|burst)\b|(?:ليس|ليست|لا يوجد|ما فيه|بدون).{0,24}(?:بنشر|ثقب|مثقوب|مسمار|تسريب|تسرب|فارغ)/i;

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/^[\s,:;،؛-]+|[\s,.،;؛-]+$/g, '').trim();
}

function normalizeDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) - (digit <= '٩' ? 0x660 : 0x6f0)));
}

function unique(values: string[]): string[] {
  const found = new Map<string, string>();
  for (const value of values) if (value) found.set(value.toLowerCase(), value);
  return [...found.values()];
}

function appendUniqueNote(existing: string, note: string): string {
  const trimmed = existing.trim();
  if (`\n${trimmed}\n`.includes(`\n${note}\n`)) return trimmed;
  return trimmed ? `${trimmed}\n${note}` : note;
}

/** Suggestions only. No recording, external inference, or booking writes occur here. */
export function extractCallBookingReview(text: string): { review: CallBookingReview; warnings: string[] } {
  if (text.length > MAX_CALL_TRANSCRIPT_LENGTH) throw new Error('Call text must be 12,000 characters or fewer.');
  const warnings: string[] = [];
  const lines = text
    .replace(/\s+(?=(?:customer|caller|client|agent|operator|admin|assistant|advisor|adviser|العميل|المتصل|الموظف|المسؤول)\s*:)/gi, '\n')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*/, ''))
    .filter((line) => line && !STAFF.test(line))
    .map((line) => line.replace(CUSTOMER, ''));
  const statements = lines.flatMap((line) => line.split(/(?<=[.!?؟;؛])\s+/)).filter((line) => !QUESTION.test(line));
  const source = statements.join('\n');
  const tyreCandidates: Array<{ size: string; uncertain: boolean }> = [];
  let rejectedTyreSize = false;
  for (const statement of statements) {
    const digits = normalizeDigits(statement);
    const matches = digits.matchAll(/\b\d{3}\s*(?:[/-]?\s*\d{2,3}\s*[/-]?\s*[Rr]\s*\d{2}|[/-]\s*\d{2,3}\s*[/-]\s*\d{2}|\s\d{2,3}\s+\d{2}|[Rr]\s*\d{2})[Cc]?\b/g);
    for (const match of matches) {
      const size = normalizeAssistedChatTyreSize(match[0]);
      if (!size) continue;
      const prefix = digits.slice(0, match.index).split(/[,;،؛]|\b(?:but|actually)\b|(?:ولكن|لكن)/i).at(-1)?.slice(-60) ?? '';
      if (/(?:\b(?:not|isn't|isn’t|isnt|no)\s+(?:(?:the|a|size|tyre|tire)\s+)*|(?:ليس|ليست|مو|مش)\s*(?:(?:المقاس|مقاسه)\s*)?)$/i.test(prefix)) {
        rejectedTyreSize = true;
        continue;
      }
      const uncertain = /\b(?:maybe|perhaps|possibly|unsure|not sure|might|could|think)\b|(?:ربما|يمكن|تقريبا|تقريباً|غير متأكد)/i.test(prefix);
      tyreCandidates.push({ size, uncertain });
    }
  }
  const tyreSizes = unique(tyreCandidates.map((candidate) => candidate.size));
  const tyreSize = tyreSizes.length === 1 && tyreCandidates.some((candidate) => !candidate.uncertain) ? tyreSizes[0] : '';
  if (tyreSizes.length > 1) warnings.push('More than one tyre size was mentioned. Confirm the required size and add any other tyres separately.');
  else if (tyreCandidates.some((candidate) => candidate.uncertain)) warnings.push('The customer was unsure of the tyre size. Confirm it before selecting a size.');
  else if (rejectedTyreSize && !tyreSize) warnings.push('The mentioned tyre size was ruled out. Confirm the correct size with the customer.');
  else if (!tyreSize) warnings.push('No clear tyre size found. Confirm it with the customer or the tyre sidewall.');

  const locations: string[] = [];
  for (const statement of statements) {
    const markers = [...statement.matchAll(/(?:\b(?:address|location)\s*[:=-]\s*|\b(?:my\s+(?:address|location)\s+is|i\s+am\s+at|i['’]m\s+at|we\s+are\s+at|located\s+at)\s+|(?:العنوان|الموقع)\s*[:=-]\s*|(?:عنواني|موقعي)\s+(?:هو\s+)?|أنا\s+(?:في|عند)\s+)/gi)];
    markers.forEach((marker, index) => {
      const candidate = statement.slice(marker.index + marker[0].length, markers[index + 1]?.index)
        .replace(/\s+(?:but|and|however|actually|لكن|ولكن)\s*$/i, '');
      const address = clean(candidate.split(/(?:[,،;؛]\s*|\s+(?:and\s+)?)(?=(?:my\s+(?:tyre|tire)|the\s+(?:tyre|tire)|(?:tyre|tire)(?:\s+size)?\s*[:=]|size\s*[:=]|problem\s*[:=]|issue\s*[:=]|i\s+(?:have|need)|مقاس|المشكلة|الإطار|الاطار|عندي))/i)[0]);
      if (address.length >= 4 && address.length <= 500 && !QUESTION.test(address)) locations.push(address);
    });
  }
  let locationAddress = '';
  const distinctLocations = unique(locations);
  const postcodes = unique((source.toUpperCase().match(/\b(?:GIR\s?0AA|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b/g) ?? [])
    .map((value) => value.replace(/\s/g, '').replace(/(.+)(.{3})$/, '$1 $2')));
  if (distinctLocations.length > 1) warnings.push('More than one location was mentioned. Confirm where the customer needs assistance.');
  else if (postcodes.length > 1) warnings.push('Conflicting postcodes were mentioned. Confirm the full address and correct postcode.');
  else if (distinctLocations.length === 1) locationAddress = distinctLocations[0];
  else {
    if (postcodes.length === 1) {
      locationAddress = postcodes[0];
      warnings.push('Only a postcode was found. Confirm the full address or exact roadside location.');
    } else warnings.push('No clear location found. Ask for the address or a location link.');
  }

  const problems: string[] = [];
  for (const statement of statements) {
    const explicit = statement.match(/(?:\b(?:problem|issue)\s*[:=-]\s*|(?:المشكلة|العطل)\s*[:=-]\s*)(.+)/i)?.[1];
    if (explicit) problems.push(clean(explicit));
    else if (ISSUE.test(statement) && !NEGATED_ISSUE.test(statement)) problems.push(clean(statement));
  }
  const problem = unique(problems).join('\n').slice(0, 1_200);
  if (!problem) warnings.push('No clear problem found. Add the customer’s description before applying the draft.');
  return {
    review: { locationAddress, tyreSize, problem, serviceType: 'assess', useLocation: Boolean(locationAddress), useTyreSize: Boolean(tyreSize), useProblem: Boolean(problem) },
    warnings,
  };
}

export function getCallBookingDraftBlockedReason(draft: AssistedChatDraft): string | null {
  return draft.quickBookingId || draft.savedQuoteId || draft.savedQuoteRef || draft.paymentLink || draft.dispatchedBookingId || draft.dispatchedRefNumber
    ? 'This draft is linked to a saved quote or booking. Start a new draft before applying call details.'
    : null;
}

/** Called only after the operator reviews the selected fields. Returns local changes, never saves a booking. */
export function buildCallBookingDraftPatch(draft: AssistedChatDraft, review: CallBookingReview): Partial<AssistedChatDraft> {
  const blocked = getCallBookingDraftBlockedReason(draft);
  if (blocked) throw new Error(blocked);
  const address = review.locationAddress.trim();
  const problem = review.problem.trim();
  const tyreSize = review.useTyreSize ? normalizeAssistedChatTyreSize(review.tyreSize) : null;
  if (review.useLocation && (!address || address.length > 500)) throw new Error('Enter a location of 500 characters or fewer, or deselect it.');
  if (review.useTyreSize && !tyreSize) throw new Error('Enter a valid tyre size, such as 205/55 R16, or deselect it.');
  if (review.useProblem && (!problem || problem.length > 1_200)) throw new Error('Enter a problem description of 1,200 characters or fewer, or deselect it.');
  if (!review.useLocation && !review.useTyreSize && !review.useProblem) throw new Error('Select at least one reviewed field to apply.');
  if (!['fit', 'repair', 'assess', 'locking_nut'].includes(review.serviceType)) throw new Error('Choose a valid service type.');

  const patch: Partial<AssistedChatDraft> = {};
  let pricingChanged = false;
  if (review.useLocation && address !== draft.location.address.trim()) {
    patch.location = { method: 'address', address, lat: null, lng: null, postcode: null, link: null, whatsappLink: null, status: 'idle' };
    pricingChanged = true;
  }
  if (review.useTyreSize && tyreSize) {
    const primary = draft.tyreLines[0];
    if (!primary || tyreSize !== normalizeAssistedChatTyreSize(primary.size)) {
      // Brand, fitment and price metadata belong to the previous size. Keep only
      // the existing quantity; additional tyre lines remain separately reviewed.
      patch.tyreLines = [createBookingTyreLine({ id: primary?.id ?? 'tyre-1', size: tyreSize, quantity: primary?.quantity ?? 1 }), ...draft.tyreLines.slice(1)];
      patch.tyreConfirmedFromSidewall = false;
      pricingChanged = true;
    }
  }
  let note = draft.note;
  if (review.useProblem) note = appendUniqueNote(note, `Call note: ${problem}`);
  if (review.useTyreSize && tyreSize && (review.serviceType === 'assess' || review.serviceType === 'locking_nut')) {
    // Service-only booking payloads omit tyre lines. Preserve the customer's
    // reviewed size as information without including tyre work in the quote.
    note = appendUniqueNote(note, `Reported tyre size: ${tyreSize} (confirm before tyre work).`);
  }
  if (note !== draft.note) patch.note = note;
  // The operator chooses this field. Extraction deliberately defaults to an
  // inspection, so a mention of a puncture never promises a repair is suitable.
  if (review.serviceType !== draft.serviceType) {
    patch.serviceType = review.serviceType;
    pricingChanged = true;
  }
  if (pricingChanged) {
    patch.quote = null;
    patch.priceNeedsRefresh = Boolean(draft.quote || draft.priceNeedsRefresh || draft.manualPriceGbp != null);
    patch.manualPriceGbp = null;
    patch.paymentChoice = null;
    patch.paymentLink = null;
  }
  return patch;
}
