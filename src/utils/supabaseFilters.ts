// Sanitizers for values interpolated into PostgREST filter strings (.or, .filter).
// PostgREST treats commas, parens, and dots as filter syntax — leaving them in
// user input lets a caller inject extra filter clauses (e.g. `,id.gte.0` to
// match every row). For ilike values, % and _ also need to be neutralized
// so users can't broaden their own search pattern unexpectedly.

export const sanitizeOrFilterValue = (value: string): string =>
  value.replace(/[,()]/g, '');

export const sanitizeIlikePattern = (value: string): string =>
  value.replace(/[,()%_\\]/g, '');
