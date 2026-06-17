export const COURIER_OPTIONS: string[] = ['FedEx', 'DHL', 'UPS', 'Other'];
export const PATCHES_TYPE_OPTIONS: string[] = [
  'Embroidered', 'PVC', 'Woven', 'Chenille', 'Leather',
  '3D Embroidery Puff', '3D Embroidery Transfer', 'Chenille Transfer',
  'Sequin Patch', 'Sublimation Patch', 'Sublimation+Embroidery', 'DTF Transfer',
  'Silicone Transfer', 'High Density Transfer',
  'TPU+Chenille', 'TPU+Embroidery', 'TPU+Sublimation',
  'Glitter+Embroidery', 'Glitter+Chenille', 'Glitter+Embroidery 3D',
  'DTF+Chenille', 'DTF+Embroidery', 'Embroidery Transfer',
  'DST Service', 'Challenge Coin',
  'PVC Keychains', 'Embroidered Keychains', 'Leather Keychains',
  'Sample Box', 'Customize Sample Box'
];
export const DESIGN_BACKING_OPTIONS: string[] = ['Iron-on', 'Velcro', 'Adhesive', 'None'];
// Shipping countries we sell into. Extend this list AND the CHECK constraint in
// supabase/migrations/add_country_to_orders.sql when a new country is added.
export const COUNTRY_OPTIONS: string[] = [
  'USA',
  'AUSTRALIA',
  'CANADA',
  'NEW ZEALAND',
  'UK',
  'FRANCE',
  'ICELAND',
];

export const LEAD_SOURCE_OPTIONS: string[] = [
  'Google',
  'Bing',
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
  'Tawk.to',
  'Checkout',
  'Referral',
  'Repeat Order',
  'Direct',
  'Other' // Always include an "Other" for edge cases
];