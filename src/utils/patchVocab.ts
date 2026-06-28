// src/utils/patchVocab.ts
// Canonical-value normalizer for the two dropdown-constrained order fields:
// `patches_type` and `design_backing`.
//
// WHY: orders & quotes get written from several sources — the storefront checkout,
// Meta/Inbox quotes, and agents — each using its own vocabulary ("Custom PVC Patches",
// "pvc", "3d-embroidered", "velcro", "iron-on", "Iron On"…). The CRM order form's
// <select> elements only render a value that EXACTLY matches one of their <option>s, so
// any other spelling shows up blank in the editor (and risks being blanked on save).
// We map every known variant back to the canonical CRM value at write time so the
// dropdowns always display.
//
// Unknown / ambiguous values (e.g. "Custom Patch", "printed", "Unknown") pass through
// unchanged — we never invent a type or drop data.
//
// NOTE: the Deno edge functions (square-payment-webhook, stripe-balance-webhook) carry
// an INLINE copy of this exact logic because they can't import from src/. Keep in sync.

export const PATCH_TYPE_CANON = [
  'Embroidered', 'PVC', 'Woven', 'Chenille', 'Leather', '3D Embroidery Puff', '3D Embroidery Transfer',
  'Chenille Transfer', 'Sequin Patch', 'Sublimation Patch', 'Sublimation+Embroidery', 'DTF Transfer',
  'Silicone Transfer', 'High Density Transfer', 'TPU+Chenille', 'TPU+Embroidery', 'TPU+Sublimation',
  'Glitter+Embroidery', 'Glitter+Chenille', 'Glitter+Embroidery 3D', 'DTF+Chenille', 'DTF+Embroidery',
  'Embroidery Transfer', 'DST Service', 'Challenge Coin', 'PVC Keychains', 'Embroidered Keychains',
  'Leather Keychains', 'Sample Box', 'Customize Sample Box',
];

// normKey(value) -> canonical, for variants that don't already match a canonical option.
export const PATCH_TYPE_ALIAS: Record<string, string> = {
  customembroideredpatches: 'Embroidered', embroideredpatches: 'Embroidered',
  '3dembroidered': '3D Embroidery Puff',            // generic "3d-embroidered" -> puff (most common 3D)
  custom3dembroideredtransfer: '3D Embroidery Transfer',
  custompvcpatches: 'PVC',
  customwovenpatches: 'Woven',
  customchenillepatches: 'Chenille',
  customleatherpatches: 'Leather',
  customsublimationpatches: 'Sublimation Patch',
  silicone: 'Silicone Transfer', customsiliconelabels: 'Silicone Transfer',
  sequin: 'Sequin Patch', customsequinpatches: 'Sequin Patch',
  chenilletpu: 'TPU+Chenille', customchenilletpupatches: 'TPU+Chenille',
  chenilleglitter: 'Glitter+Chenille', customchenilleglitterpatches: 'Glitter+Chenille',
  pvckeychain: 'PVC Keychains',
  embroideredkeychain: 'Embroidered Keychains',
};

export const BACKING_CANON = ['Iron on', 'Sew on', 'Sticker', 'Velcro'];
export const BACKING_ALIAS: Record<string, string> = {
  iron: 'Iron on', justheatpress: 'Iron on', heatpress: 'Iron on',
  sew: 'Sew on',
  stickerbacking: 'Sticker', adhesive: 'Sticker',
};

const normKey = (s: unknown): string => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function canonicalize(value: unknown, canon: string[], alias: Record<string, string>): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const key = normKey(raw);
  const exact = canon.find((c) => normKey(c) === key); // case/spacing/punctuation-insensitive
  if (exact) return exact;
  if (alias[key]) return alias[key];
  return raw; // unknown/ambiguous -> keep original rather than guessing or dropping
}

export const normalizePatchType = (v: unknown): string | null =>
  canonicalize(v, PATCH_TYPE_CANON, PATCH_TYPE_ALIAS);

export const normalizeBacking = (v: unknown): string | null =>
  canonicalize(v, BACKING_CANON, BACKING_ALIAS);
