// src/constants/customs.ts
// Single source of truth for commercial-invoice / customs data.
//
// Customs fields (HTS code, material composition, MID, origin) are DERIVED on-demand
// from an order's patch type + backing + destination country. Nothing is stored on the
// order — see getCustomsData() in src/services/customsService.ts for the resolver.
//
// When a new patch type is added to PATCHES_TYPE_OPTIONS (src/constants/options.ts),
// add it to PATCH_TYPE_CATEGORY below, or it will fall through to "review manually".

// ── 1. Constant fields (every shipment) ─────────────────────────────────────────
export const CUSTOMS_CONSTANTS = {
  manufacturerName:    'M/S Panda Apparel & Technology',
  manufacturerAddress: 'Golwala Apartment, Plot No 307-2, Garden East, Karachi 74200, Pakistan',
  countryOfOrigin:     'Pakistan',
  isoCountryCode:      'PK',
  midCode:             'PKPANAPP307KAR',
  reasonForExport:     'Sale', // default; staff may override (Sample / Gift)
  incoterms:           'DAP',  // default; staff may override
} as const;

export const REASON_FOR_EXPORT_OPTIONS = ['Sale', 'Sample', 'Gift'] as const;
export const INCOTERMS_OPTIONS = ['DAP', 'DDP', 'EXW', 'FOB'] as const;

// ── 2. Category lookup: HTS + material template ─────────────────────────────────
// {backing} is replaced with the resolved backing wording at runtime.
// ambiguous=true → the resolver flags the order for HTS confirmation and surfaces htsAlt/materialAlt.

export interface CustomsCategory {
  hts: string;
  material: string;
  htsAlt?: string;
  materialAlt?: string;
  ambiguous?: boolean;
  note?: string;
}

export const CUSTOMS_CATEGORIES: Record<string, CustomsCategory> = {
  embroidered: {
    hts: '5810.92.1000',
    material: '100% polyester (man-made fibers), durable embroidered patch, {backing} backing, for apparel decoration',
  },
  chenille: {
    hts: '5810.92.1000',
    material: '100% acrylic chenille yarn (man-made fibers) on polyester felt backing, embroidered merrowed border, {backing} backing',
  },
  woven: {
    hts: '5810.92.9080',
    material: '100% polyester (man-made fibers), woven patch, {backing} backing, for apparel decoration',
  },
  pvc: {
    hts: '3926.90.9985',
    material: 'Soft polyvinyl chloride (PVC) plastic patch, {backing} backing',
  },
  sublimation: {
    hts: '5807.10.2010',
    htsAlt: '5807.90.2090',
    material: '100% polyester woven fabric (man-made fibers), dye-sublimation printed, not embroidered, cut to shape, {backing} backing',
    materialAlt: '100% polyester non-woven/felt fabric (man-made fibers), dye-sublimation printed, not embroidered, cut to shape, {backing} backing',
    ambiguous: true,
    note: 'Confirm base fabric: woven (5807.10.2010) vs non-woven/felt/knit (5807.90.2090).',
  },
  leather: {
    hts: '4205.00.8000',
    htsAlt: '3926.90.9985',
    material: 'Genuine leather patch, {backing} backing, for apparel decoration',
    materialAlt: '100% PU/polyurethane synthetic leather patch, {backing} backing',
    ambiguous: true,
    note: 'Confirm material: genuine leather (4205.00.8000) vs PU/faux leather (3926.90.9985).',
  },
};

// ── 3. Patch-type → category mapping (covers all PATCHES_TYPE_OPTIONS) ───────────
// `category` keys into CUSTOMS_CATEGORIES.
// `modifier` is appended to the material string to describe the specific construction.
// `forceConfirm` flags the line for manual HTS review even when the category is unambiguous
//   (used for composites, metal coins, and keychains whose fittings may change classification).
// `manualOnly` → no auto customs data; surface a "review manually" notice instead.

export interface PatchTypeMapping {
  category?: keyof typeof CUSTOMS_CATEGORIES;
  modifier?: string;
  forceConfirm?: boolean;
  manualOnly?: boolean;
  confirmNote?: string;
}

export const PATCH_TYPE_CATEGORY: Record<string, PatchTypeMapping> = {
  // ── Embroidered family ──
  'embroidered':              { category: 'embroidered' },
  'embroidered patches':      { category: 'embroidered' },
  '3d embroidery puff':       { category: 'embroidered', modifier: '3D puff raised foam embroidery' },
  '3d embroidery transfer':   { category: 'embroidered', modifier: '3D embroidery, heat-transfer backing' },
  'embroidery transfer':      { category: 'embroidered', modifier: 'embroidery, heat-transfer backing' },
  'custom 3d embroidered transfers': { category: 'embroidered', modifier: '3D embroidery, heat-transfer backing' },
  'high density transfer':    { category: 'embroidered', modifier: 'high-density embroidery, heat-transfer backing' },

  // ── Chenille family ──
  'chenille':                 { category: 'chenille' },
  'chenille patches':         { category: 'chenille' },
  'chenille transfer':        { category: 'chenille', modifier: 'heat-transfer backing' },

  // ── Woven ──
  'woven':                    { category: 'woven' },
  'woven patches':            { category: 'woven' },

  // ── PVC / silicone ──
  'pvc':                      { category: 'pvc' },
  'pvc patches':              { category: 'pvc' },
  'silicone transfer':        { category: 'pvc', modifier: 'silicone, heat-transfer backing' },

  // ── Sublimation / DTF (printed) ──
  'sublimation patch':        { category: 'sublimation' },
  'sublimation':              { category: 'sublimation' },
  'dtf transfer':             { category: 'sublimation', modifier: 'DTF (direct-to-film) printed, heat-transfer backing' },

  // ── Leather ──
  'leather':                  { category: 'leather' },
  'leather patches':          { category: 'leather' },

  // ── Composites — best-effort by dominant decoration, flagged for confirmation ──
  'sublimation+embroidery':   { category: 'embroidered', modifier: 'combined sublimation print + embroidery', forceConfirm: true },
  'tpu+embroidery':           { category: 'embroidered', modifier: 'TPU base with embroidery', forceConfirm: true },
  'tpu+chenille':             { category: 'chenille',     modifier: 'TPU base with chenille', forceConfirm: true },
  'tpu+sublimation':          { category: 'sublimation',  modifier: 'TPU base with sublimation print', forceConfirm: true },
  'glitter+embroidery':       { category: 'embroidered', modifier: 'glitter with embroidery', forceConfirm: true },
  'glitter+embroidery 3d':    { category: 'embroidered', modifier: '3D glitter with embroidery', forceConfirm: true },
  'glitter+chenille':         { category: 'chenille',     modifier: 'glitter with chenille', forceConfirm: true },
  'dtf+embroidery':           { category: 'embroidered', modifier: 'DTF print with embroidery', forceConfirm: true },
  'dtf+chenille':             { category: 'chenille',     modifier: 'DTF print with chenille', forceConfirm: true },
  'sequin patch':             { category: 'embroidered', modifier: 'sequin with embroidered border', forceConfirm: true },

  // ── Metal coin & keychains — different HTS than textile patches, always confirm ──
  'challenge coin':           { forceConfirm: true, confirmNote: 'Metal item — likely HTS 8306.29 (base-metal ornament) or 7117.19 (imitation jewelry). Confirm before filing.' },
  'pvc keychains':            { category: 'pvc',         modifier: 'PVC keychain with metal keyring fitting', forceConfirm: true, confirmNote: 'Keyring fitting may change classification (e.g. 7326.20). Confirm before filing.' },
  'embroidered keychains':    { category: 'embroidered', modifier: 'embroidered keychain with metal keyring fitting', forceConfirm: true, confirmNote: 'Keyring fitting may change classification. Confirm before filing.' },
  'leather keychains':        { category: 'leather',     modifier: 'leather keychain with metal keyring fitting', forceConfirm: true, confirmNote: 'Keyring fitting may change classification. Confirm before filing.' },

  // ── Non-goods / services — no standard customs data ──
  'dst service':              { manualOnly: true, confirmNote: 'Digitizing service — not a physical exportable good. Review manually.' },
  'sample box':               { manualOnly: true, confirmNote: 'Mixed-contents sample box. Itemize and classify each sample manually.' },
  'customize sample box':     { manualOnly: true, confirmNote: 'Mixed-contents sample box. Itemize and classify each sample manually.' },
  'dst':                      { manualOnly: true, confirmNote: 'Digitizing service — not a physical exportable good. Review manually.' },
};

// ── 4. Backing → invoice wording ────────────────────────────────────────────────
export const BACKING_WORDING: Record<string, string> = {
  'iron-on':    'iron-on (heat-seal)',
  'velcro':     'Velcro (hook-and-loop)',
  'sew-on':     'sew-on',
  'adhesive':   'self-adhesive sticker',
  'sticker':    'self-adhesive sticker',
  'none':       'no',
  'no backing': 'no',
};

export const DEFAULT_BACKING_WORDING = 'iron-on / sew-on / Velcro';
