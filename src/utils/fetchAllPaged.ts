// PostgREST caps a single response at 1000 rows by default. Any query that is then
// aggregated client-side (reports, bulk cost entry, lead-source shares) silently
// UNDERSTATES its totals past 1000 rows — with no error. This pages through the full
// result set via .range() until a short page signals the end.
//
// Usage: pass a factory that applies your filters + .order() and returns the query
// with .range(from, to) applied last:
//
//   const rows = await fetchAllPaged<Row>((from, to) =>
//     supabase.from('orders').select('*').order('created_at').range(from, to)
//   );

const PAGE_SIZE = 1000;

export async function fetchAllPaged<T = any>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await makeQuery(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break; // last (short) page
  }
  return all;
}
