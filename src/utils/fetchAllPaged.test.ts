import { describe, it, expect, vi } from 'vitest';
import { fetchAllPaged } from './fetchAllPaged';

// fetchAllPaged is what protects every client-aggregated report from PostgREST's
// silent 1000-row cap. If it ever stops paging, the P&L understates with no error —
// so the paging boundary is the important thing to pin down.

const makeSource = (total: number) => {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  return vi.fn((from: number, to: number) =>
    Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
  );
};

describe('fetchAllPaged', () => {
  it('returns everything for a single short page', async () => {
    const src = makeSource(42);
    const out = await fetchAllPaged(src);
    expect(out).toHaveLength(42);
    expect(src).toHaveBeenCalledTimes(1);
    expect(src).toHaveBeenCalledWith(0, 999);
  });

  it('pages through results larger than the 1000-row cap', async () => {
    const src = makeSource(2500);
    const out = await fetchAllPaged(src);
    expect(out).toHaveLength(2500);
    // 1000 + 1000 + 500(short) => 3 calls, then stop
    expect(src).toHaveBeenCalledTimes(3);
    expect(src).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(new Set(out.map((r) => r.id)).size).toBe(2500); // no dupes / gaps
  });

  it('makes one extra empty request when the total is an exact multiple of the page size', async () => {
    const src = makeSource(2000);
    const out = await fetchAllPaged(src);
    expect(out).toHaveLength(2000);
    expect(src).toHaveBeenCalledTimes(3); // 1000, 1000, then 0-row page stops it
  });

  it('returns an empty array when there are no rows', async () => {
    const src = makeSource(0);
    expect(await fetchAllPaged(src)).toEqual([]);
    expect(src).toHaveBeenCalledTimes(1);
  });

  it('throws if a page errors, instead of silently truncating', async () => {
    const src = vi.fn(() => Promise.resolve({ data: null, error: { message: 'boom' } }));
    await expect(fetchAllPaged(src)).rejects.toThrow();
  });
});
