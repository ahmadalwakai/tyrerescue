import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  pools: [] as Array<{ options: unknown; end: ReturnType<typeof vi.fn> }>,
  execute: vi.fn(), transactionFailure: null as Error | null,
}));
vi.mock('@neondatabase/serverless', () => ({
  neonConfig: {}, Pool: class {
    end = vi.fn(async () => {});
    constructor(options: unknown) { state.pools.push({ options, end: this.end }); }
  },
}));
vi.mock('drizzle-orm/neon-serverless', () => ({ drizzle: vi.fn(() => ({
  transaction: async (callback: (tx: { execute: typeof state.execute }) => Promise<unknown>) => {
    if (state.transactionFailure) throw state.transactionFailure;
    return callback({ execute: state.execute });
  },
})) }));
import { withTaxWriteTransaction } from '../tax-payroll/write-transaction';
afterEach(() => { state.pools.length = 0; state.execute.mockReset(); state.transactionFailure = null; });

describe('tax payroll write connection lifecycle', () => {
  it('uses a bounded independent request connection, sets transaction timeouts and disposes it on success', async () => {
    const callback = vi.fn(async () => ({ saved: true }));
    expect(await withTaxWriteTransaction(callback)).toEqual({ saved: true });
    expect(state.pools).toHaveLength(1);
    expect(state.pools[0].options).toMatchObject({ max: 1, connectionTimeoutMillis: 8000, idleTimeoutMillis: 10000 });
    expect(state.execute).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledOnce();
    expect(state.pools[0].end).toHaveBeenCalledOnce();
  });
  it('disposes the connection and preserves callback errors for rollback', async () => {
    const error = new Error('Synthetic transaction failure');
    await expect(withTaxWriteTransaction(async () => { throw error; })).rejects.toBe(error);
    expect(state.pools[0].end).toHaveBeenCalledOnce();
  });
  it('disposes even if opening the transaction fails, without running any writes', async () => {
    state.transactionFailure = new Error('Synthetic connection failure');
    const callback = vi.fn(async () => {});
    await expect(withTaxWriteTransaction(callback)).rejects.toBe(state.transactionFailure);
    expect(callback).not.toHaveBeenCalled();
    expect(state.pools[0].end).toHaveBeenCalledOnce();
  });
  it('does not share the request connection with another payroll operation', async () => {
    await Promise.all([withTaxWriteTransaction(async () => 1), withTaxWriteTransaction(async () => 2)]);
    expect(state.pools).toHaveLength(2);
    for (const pool of state.pools) expect(pool.end).toHaveBeenCalledOnce();
  });
});
