import { BOOKING_DRAFT_KEY, bookingDraft } from './booking-safety';
import { deleteSecureItem, setSecureItem } from './secure-storage';
import type { BookingState } from './types';
let writes = Promise.resolve();
let generation = 0;
export function bookingDraftSession() { return generation; }
export function invalidateBookingDraftSession() { generation++; }
export function saveBookingDraft(state: BookingState, step: string, session = generation) {
  const value = bookingDraft(state, step);
  writes = writes.catch(() => {}).then(() => session === generation ? setSecureItem(BOOKING_DRAFT_KEY, value) : undefined);
  return writes;
}
export function clearBookingDraft() {
  writes = writes.catch(() => {}).then(() => deleteSecureItem(BOOKING_DRAFT_KEY));
  return writes;
}
