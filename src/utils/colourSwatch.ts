// src/utils/colourSwatch.ts
// Turn orders.customer_colour_hex into something CSS will actually paint.
//
// WHY THIS EXISTS: the website parses the hex "with or without the #, normalised to
// lowercase 6-digit" (website dev, 2026-09-04). "Normalised to lowercase 6-digit" does not
// say whether the leading # survives — and `background-color: 1e3a8a` is silently invalid
// CSS. The swatch just wouldn't paint: no error, no console warning, and on a colour-match
// order the swatch is the one thing telling a supervisor what the customer meant.
//
// So accept both, and return null for anything that isn't a hex rather than handing CSS a
// string to ignore. Callers render the swatch only when this returns non-null.
//
// Deliberately strict about WHAT it accepts: customer_colour_input is free text ("PMS 186 C",
// "royal blue") and must never be coerced into a swatch — a wrong colour shown confidently is
// worse than no colour shown at all.

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * `"1e3a8a"` / `"#1E3A8A"` / `"#abc"` → `"#1e3a8a"` / `"#1e3a8a"` / `"#abc"`.
 * Anything else (a colour name, a Pantone code, empty, null) → `null`.
 */
export const toCssHex = (value: unknown): string | null => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const m = HEX.exec(raw);
  if (!m) return null;
  return `#${m[1].toLowerCase()}`;
};
