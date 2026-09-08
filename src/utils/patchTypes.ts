// Multi-type orders — "10 leather + 10 woven" on one order (CEO decision, 9 Sept 2026).
//
// `patches_type` is the PRIMARY type and is unchanged: it still drives the colour-match gate,
// digitizer routing, customs classification, production-email routing (PVC gets no internal
// email) and the product-mix reports. `additional_patch_types` records the extras alongside it.
// Per-type quantities live in Special Instructions; the quantity box is the order total.
//
// This file holds the shape rules ONCE. The database enforces the same rules in the CHECK
// constraint `orders_additional_patch_types_valid`, so if the form disagrees with them the
// save fails at the database with a constraint error the agent cannot act on. Keeping the
// browser copy here — and pinned by tests — means the form quietly produces a value the
// database already accepts.
//
// Deliberately NOT validated here: the patch type vocabulary. `patches_type` has never had a
// whitelist (34 distinct values are in the table today, "PVC" and "PVC Patches" among them),
// and rejecting a spelling on the secondary field that the primary field accepts happily would
// be a rule that exists nowhere else in the system.

/** Matches the DB CHECK: cardinality <= 10. */
export const MAX_ADDITIONAL_PATCH_TYPES = 10;

/**
 * Clean a list of extra patch types against the primary type.
 *
 * Drops blanks, trims, removes duplicates (first spelling wins), and removes any entry equal
 * to the primary — an agent can change the primary type to one already listed as an extra, and
 * the database rejects that combination outright.
 */
export function normalizeExtraPatchTypes(
  extras: readonly (string | null | undefined)[] | null | undefined,
  primaryType: string | null | undefined,
): string[] {
  if (!Array.isArray(extras)) return [];
  const primary = (primaryType ?? '').trim();
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of extras) {
    const value = String(raw ?? '').trim();
    if (!value) continue;                 // no blank chips
    if (value === primary) continue;      // never repeat the primary
    if (seen.has(value)) continue;        // "Leather" twice is always a mistake
    seen.add(value);
    out.push(value);
    if (out.length >= MAX_ADDITIONAL_PATCH_TYPES) break;
  }
  return out;
}

/**
 * What to WRITE to the database. `null` rather than `[]` for an ordinary single-type order, so
 * the overwhelming majority of rows stay exactly as they are today and "has extra types" is a
 * plain NULL check rather than a length check.
 */
export function toAdditionalPatchTypesPayload(
  extras: readonly (string | null | undefined)[] | null | undefined,
  primaryType: string | null | undefined,
): string[] | null {
  const cleaned = normalizeExtraPatchTypes(extras, primaryType);
  return cleaned.length ? cleaned : null;
}

/**
 * Every type on the order, primary first — the browser-side mirror of the generated
 * `all_patch_types` column. For labels and tooltips; the column is what queries filter on.
 */
export function allPatchTypes(
  primaryType: string | null | undefined,
  extras: readonly (string | null | undefined)[] | null | undefined,
): string[] {
  const primary = (primaryType ?? '').trim();
  const cleaned = normalizeExtraPatchTypes(extras, primary);
  return primary ? [primary, ...cleaned] : cleaned;
}
