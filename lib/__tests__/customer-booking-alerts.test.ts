import { describe, expect, it } from 'vitest';
import {
  formatBookingAlertDate,
  getBookingAlertCopy,
  isUrgentBookingAlert,
  selectBookingAlertCandidate,
  shouldTriggerBookingAlert,
} from '../../assisted-chat-app/src/types/new-customer-booking-alerts';

const website = { sourceApp: 'tyre_rescue', bookingOrigin: 'customer' };

describe('Assisted Chat customer booking alerts', () => {
  it('prioritises an unseen older emergency over the newest scheduled booking', () => {
    const scheduled = { ...website, id: 'new-scheduled', bookingType: 'scheduled', createdAt: '2026-10-21T10:02:00Z' };
    const emergency = { ...website, id: 'unseen-emergency', bookingType: 'emergency', createdAt: '2026-10-21T10:01:00Z' };
    const selected = selectBookingAlertCandidate([scheduled, emergency]);
    expect(selected).toBe(emergency);
    expect(selected?.createdAt).toBe('2026-10-21T10:01:00Z');
  });

  it('keeps a project handoff urgent ahead of normal scheduled work', () => {
    const scheduled = { ...website, id: 'scheduled', bookingType: 'scheduled' };
    const project = { sourceApp: 'fitmytyre', id: 'project', bookingType: 'scheduled', isCustomerOriginated: false };
    expect(selectBookingAlertCandidate([scheduled, project])).toBe(project);
  });

  it('chooses the newest eligible scheduled booking when no urgent work is unseen', () => {
    const admin = { sourceApp: 'tyre_rescue', id: 'admin', bookingType: 'emergency', isCustomerOriginated: false };
    const scheduled = { ...website, id: 'scheduled', bookingType: 'scheduled' };
    expect(selectBookingAlertCandidate([admin, scheduled])).toBe(scheduled);
    expect(selectBookingAlertCandidate([admin])).toBeUndefined();
  });

  it.each(['emergency', 'scheduled'])('alerts for a customer website %s booking', (bookingType) => {
    expect(shouldTriggerBookingAlert({ ...website, bookingType })).toBe(true);
  });

  it('keeps eligibility separate from urgency', () => {
    expect(isUrgentBookingAlert({ ...website, bookingType: 'emergency' })).toBe(true);
    expect(isUrgentBookingAlert({ ...website, bookingType: 'scheduled' })).toBe(false);
  });

  it.each(['admin_quick_book', 'assisted_chat'])('excludes non-project %s bookings', (bookingOrigin) => {
    for (const bookingType of ['emergency', 'scheduled']) {
      const item = { sourceApp: 'tyre_rescue', bookingOrigin, bookingType };
      expect(shouldTriggerBookingAlert(item)).toBe(false);
      expect(isUrgentBookingAlert(item)).toBe(false);
    }
  });

  it('honours the authoritative customer flag and requires known customer origin', () => {
    expect(shouldTriggerBookingAlert({ ...website, bookingType: 'scheduled', isCustomerOriginated: false })).toBe(false);
    expect(shouldTriggerBookingAlert({ bookingType: 'emergency' })).toBe(false);
    expect(shouldTriggerBookingAlert({ isCustomerOriginated: true, bookingType: ' scheduled ' })).toBe(true);
    expect(shouldTriggerBookingAlert({ ...website, bookingType: 'unknown' })).toBe(false);
  });

  it.each(['emergency', 'scheduled'])('preserves urgent integrated-project %s alerts', (bookingType) => {
    const item = { sourceApp: 'tyrerepair_uk', bookingType, isCustomerOriginated: false };
    expect(shouldTriggerBookingAlert(item)).toBe(true);
    expect(isUrgentBookingAlert(item)).toBe(true);
  });

  it('labels scheduled bookings and includes their appointment in UK time', () => {
    const copy = getBookingAlertCopy({ ...website, bookingType: 'scheduled', customerName: 'Sam', scheduledAt: '2026-06-01T09:30:00Z' });
    expect(copy.title).toBe('Scheduled booking received');
    expect(copy.eyebrow).toBe('Scheduled booking');
    expect(copy.bookingTypeLabel).toBe('Scheduled');
    expect(copy.body).toContain('Sam');
    expect(copy.body).toContain('01 Jun 2026');
    expect(copy.body).toContain('10:30');
    expect(copy.body).toContain('UK time');
    expect(`${copy.title} ${copy.body} ${copy.eyebrow}`).not.toMatch(/emergency|urgent/i);
  });

  it('preserves the project identity while clearly labelling scheduled handoffs', () => {
    const copy = getBookingAlertCopy({ sourceApp: 'fitmytyre', sourceLabel: 'FitMyTyre', externalReference: 'FMT-42', bookingType: 'scheduled' });
    expect(copy.title).toBe('Scheduled project booking received');
    expect(copy.body).toContain('FitMyTyre reference FMT-42');
    expect(copy.body).not.toMatch(/emergency/i);
  });

  it('uses the emergency title only for actual emergency bookings', () => {
    expect(getBookingAlertCopy({ ...website, bookingType: 'emergency' }).title).toBe('Emergency booking received');
    expect(getBookingAlertCopy({}).title).toBe('New booking received');
  });

  it('does not invent an appointment when the date is missing or invalid', () => {
    expect(formatBookingAlertDate(null)).toBe('To be confirmed');
    expect(formatBookingAlertDate('invalid')).toBe('To be confirmed');
    expect(formatBookingAlertDate('2026-12-01T09:30:00Z')).toContain('09:30');
  });
});
