// src/utils/pageWindow.ts
// Which page numbers to render in a pager, given the current page and the total.
//
// Previous/Next alone means reaching page 15 costs fourteen clicks and fourteen round
// trips to the database. This returns a compact set — first page, a window around the
// current one, last page — with '…' marking the gaps.
//
// Kept as a pure function so the awkward cases are testable without a browser: the ends
// of the range, a total small enough that every page fits, and the off-by-one where an
// ellipsis would stand in for exactly one hidden page (in which case we render the page
// instead, because "…" that hides a single number is worse than the number).

export type PageToken = number | 'gap';

/**
 * @param current 1-based current page
 * @param total   total number of pages
 * @param radius  how many pages to show either side of `current`
 */
export function pageWindow(current: number, total: number, radius = 1): PageToken[] {
  if (!Number.isFinite(total) || total < 1) return [];
  const cur = Math.min(Math.max(Math.round(current) || 1, 1), total);

  // First page, last page, and the window around the current one.
  const wanted = new Set<number>([1, total]);
  for (let p = cur - radius; p <= cur + radius; p++) {
    if (p >= 1 && p <= total) wanted.add(p);
  }
  // Keep the bar a stable width near the ends, so it doesn't shrink on page 1.
  if (cur <= radius + 2) for (let p = 2; p <= Math.min(radius * 2 + 3, total); p++) wanted.add(p);
  if (cur >= total - radius - 1) for (let p = Math.max(total - radius * 2 - 2, 1); p < total; p++) wanted.add(p);

  const pages = [...wanted].sort((a, b) => a - b);

  const out: PageToken[] = [];
  let prev = 0;
  for (const p of pages) {
    if (prev) {
      // A gap of exactly one page: show the page rather than an ellipsis that hides it.
      if (p - prev === 2) out.push(prev + 1);
      else if (p - prev > 2) out.push('gap');
    }
    out.push(p);
    prev = p;
  }
  return out;
}
