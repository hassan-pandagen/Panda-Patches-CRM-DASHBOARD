export const COURIER_OPTIONS: string[] = ['FedEx', 'DHL', 'UPS', 'Other'];
export const PATCHES_TYPE_OPTIONS: string[] = [
  // Letter packages — must be listed, or the order form's <select> renders blank for them
  // and an edit-and-save would wipe patches_type. See the note at the top of patchVocab.ts.
  'Chenille Alphabet Package (A–Z)', 'Chenille Numbers Package (0–9)',
  'Embroidered', 'PVC', 'Woven', 'Chenille', 'Chenille+Embroidery', 'Leather',
  '3D Embroidery Puff', '3D Embroidery Transfer', 'Chenille Transfer', 'Applique Transfer',
  'Sequin Patch', 'Sublimation Patch', 'Sublimation+Embroidery', 'DTF Transfer',
  'Silicone Transfer', 'High Density Transfer',
  'TPU+Chenille', 'TPU+Embroidery', 'TPU+Sublimation',
  'Glitter+Embroidery', 'Glitter+Chenille', 'Glitter+Embroidery 3D',
  'DTF+Chenille', 'DTF+Embroidery', 'Embroidery Transfer', 'Heat Transfer',
  'DST Service', 'Challenge Coin',
  'PVC Keychains', 'Embroidered Keychains', 'Leather Keychains',
  'Custom Lapel Pins', 'Custom PVC Shoe Charms',
  'Sample Box', 'Customize Sample Box'
];
// Canonical backing values — the SIX backings used on the website + database (single source of
// truth). Keep in sync with BACKING_CANON in src/utils/patchVocab.ts AND the webhook's
// resolveBacking. Shared by the order form, agent payment form, customer payment page, and inbox.
export const DESIGN_BACKING_OPTIONS: string[] = [
  'Iron-On', 'Sew-On', 'Velcro (Hook & Loop)', 'Adhesive (Peel & Stick)', 'Magnetic', 'Button-Loop',
];
// Shipping countries we sell into. Extend this list AND the CHECK constraint in
// supabase/migrations/add_country_to_orders.sql when a new country is added.
export const COUNTRY_OPTIONS: string[] = [
  'USA',
  'AUSTRALIA',
  'CANADA',
  'NEW ZEALAND',
  'UK',
  'FRANCE',
  'GERMANY',
  'ICELAND',
];

export const LEAD_SOURCE_OPTIONS: string[] = [
  // Paid-ad sources the webhook / detectLeadSource auto-assign from click IDs (fbclid/gclid/…).
  // These MUST be selectable here — otherwise an order edit finds no matching <option>, renders a
  // BLANK Lead Source, and silently WIPES the real source on save (this reverted PP-11232/11245).
  'Facebook Ad',
  // Meta paid placements arrive as "Instagram Ads (<ad id>)" with utm_medium=paid. Folding
  // those to plain 'Instagram' would lose the paid signal, so the ad placement gets its own
  // option — consistent with Facebook Ad / Google Ad / Bing Ad / TikTok Ad.
  'Instagram Ad',
  'Google Ad',
  'Bing Ad',
  'TikTok Ad',
  'Google',
  'Bing',
  'DuckDuckGo',
  'Brave',
  'Facebook',
  'Instagram',
  'TikTok',
  'YouTube',
  'LinkedIn',
  'Snapchat',
  'WhatsApp',
  'RingCentral',
  'ChatGPT',
  'Gemini',
  'Perplexity',
  'Claude',
  'Meta AI',
  'DeepSeek',
  'Copilot',
  'Grok',
  'Google AI Overview',
  'Tawk.to',
  'Referral',
  'Repeat Order',
  'Direct',
  'Other' // Always include an "Other" for edge cases
];