import { describe, it, expect } from 'vitest';
import { pageWindow } from './pageWindow';

describe('pageWindow', () => {
  it('shows every page when they all fit', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(2, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('always includes the first and last page', () => {
    const w = pageWindow(15, 42);
    expect(w[0]).toBe(1);
    expect(w[w.length - 1]).toBe(42);
    expect(w).toContain(15);
  });

  it('brackets the current page with a gap on each side', () => {
    expect(pageWindow(15, 42)).toEqual([1, 'gap', 14, 15, 16, 'gap', 42]);
  });

  it('keeps a stable width at the start and the end', () => {
    // No leading gap on page 1 — nothing is hidden before it.
    expect(pageWindow(1, 42)).toEqual([1, 2, 3, 4, 5, 'gap', 42]);
    expect(pageWindow(42, 42)).toEqual([1, 'gap', 38, 39, 40, 41, 42]);
  });

  it('renders the page instead of a gap that would hide exactly one', () => {
    // 1 … 3 would hide only page 2, which is worse than just showing it.
    expect(pageWindow(4, 8)).toEqual([1, 2, 3, 4, 5, 'gap', 8]);
    expect(pageWindow(6, 8)).toEqual([1, 'gap', 4, 5, 6, 7, 8]);
  });

  it('never emits two gaps in a row or a page twice', () => {
    for (let total = 1; total <= 60; total++) {
      for (let cur = 1; cur <= total; cur++) {
        const w = pageWindow(cur, total);
        const nums = w.filter((t): t is number => t !== 'gap');
        expect(new Set(nums).size).toBe(nums.length);          // no duplicates
        expect([...nums]).toEqual([...nums].sort((a, b) => a - b)); // ascending
        for (let i = 1; i < w.length; i++) {
          expect(w[i] === 'gap' && w[i - 1] === 'gap').toBe(false);
        }
      }
    }
  });

  it('clamps a nonsense current page instead of throwing', () => {
    expect(pageWindow(0, 5)).toContain(1);
    expect(pageWindow(99, 5)).toContain(5);
    expect(pageWindow(1, 0)).toEqual([]);
  });
});
