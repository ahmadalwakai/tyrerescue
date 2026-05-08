import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for sendBookingEmailOnce idempotency model:
 *   - blocks only when an existing notification row has status='sent'
 *   - allows a fresh attempt when previous row was status='failed'
 *   - records failure (does not mark as sent) when provider returns success=false
 */

// vi.hoisted lets us reference these from inside vi.mock factories which
// vitest hoists to the top of the file.
const state = vi.hoisted(() => {
  type NotifRow = { id: string; bookingId: string; type: string; status: string };
  const data: {
    existingRows: NotifRow[];
    insertedRows: NotifRow[];
    updateCalls: { status: string }[];
  } = { existingRows: [], insertedRows: [], updateCalls: [] };
  return data;
});

const sendMock = vi.hoisted(() => vi.fn());

function makeSelectChain(result: unknown[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(result),
  };
  return chain;
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => makeSelectChain(state.existingRows),
    insert: () => ({
      values: (vals: { bookingId: string; type: string; status?: string }) => ({
        returning: () => {
          const row = {
            id: `n-${state.insertedRows.length + 1}`,
            bookingId: vals.bookingId,
            type: vals.type,
            status: vals.status ?? 'pending',
          };
          state.insertedRows.push(row);
          return Promise.resolve([{ id: row.id }]);
        },
      }),
    }),
    update: () => ({
      set: (vals: { status: string }) => ({
        where: () => {
          state.updateCalls.push({ status: vals.status });
          return Promise.resolve();
        },
      }),
    }),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  notifications: {
    id: 'id',
    bookingId: 'bookingId',
    type: 'type',
    status: 'status',
    attempts: 'attempts',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
}));

vi.mock('../email/sender', () => ({
  sendWithFallback: sendMock,
}));

import { sendBookingEmailOnce } from '../email/resend';

const baseOptions = {
  to: 'customer@example.com',
  subject: 'Booking Confirmed',
  html: '<p>Hi</p>',
  type: 'booking-confirmed',
  bookingId: 'b-1',
};

describe('sendBookingEmailOnce — idempotency + failure retry', () => {
  beforeEach(() => {
    state.existingRows = [];
    state.insertedRows = [];
    state.updateCalls.length = 0;
    sendMock.mockReset();
  });

  it('skips when an identical notification is already status=sent', async () => {
    state.existingRows = [
      { id: 'old-1', bookingId: 'b-1', type: 'booking-confirmed', status: 'sent' },
    ];

    const result = await sendBookingEmailOnce(baseOptions);

    expect(result.success).toBe(true);
    expect('skipped' in result && result.skipped).toBe(true);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('sends when no prior notification exists, marks status=sent on success', async () => {
    sendMock.mockResolvedValue({
      success: true,
      provider: 'zeptomail',
      messageId: 'mid-1',
      attemptedProviders: ['zeptomail'],
      fallbackUsed: false,
    });

    const result = await sendBookingEmailOnce(baseOptions);

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect('skipped' in result && result.skipped).toBe(false);
    expect(state.insertedRows[0]?.status).toBe('pending');
    expect(state.updateCalls.some((c) => c.status === 'sent')).toBe(true);
    expect(state.updateCalls.some((c) => c.status === 'failed')).toBe(false);
  });

  it('does not mark as sent when provider returns success=false; records failed', async () => {
    sendMock.mockResolvedValue({
      success: false,
      provider: 'zeptomail',
      error: 'ZeptoMail error 401',
      attemptedProviders: ['zeptomail'],
      fallbackUsed: false,
    });

    const result = await sendBookingEmailOnce(baseOptions);

    expect(result.success).toBe(false);
    expect(state.updateCalls.some((c) => c.status === 'failed')).toBe(true);
    expect(state.updateCalls.some((c) => c.status === 'sent')).toBe(false);
  });

  it('retries when only a previous failed row exists (not status=sent)', async () => {
    // Simulate: previous attempt left row with status='failed'. The SELECT
    // filters on status='sent' so it returns empty, allowing a fresh send.
    state.existingRows = []; // because the WHERE includes status='sent'
    sendMock.mockResolvedValue({
      success: true,
      provider: 'zeptomail',
      messageId: 'mid-2',
      attemptedProviders: ['zeptomail'],
      fallbackUsed: false,
    });

    const result = await sendBookingEmailOnce(baseOptions);

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect('skipped' in result && result.skipped).toBe(false);
  });
});
