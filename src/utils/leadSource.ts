// src/utils/leadSource.ts
// Single source of truth for resolving "where did this lead come from?"
// Reads the `attribution` JSONB column on quotes/orders and returns a clean
// label like "Facebook Ad" / "Google Ad" / "ChatGPT" / "Direct" etc.
//
// Order of precedence (most specific → least):
//   1. Paid click IDs (fbclid, gclid, msclkid)  → ad attribution
//   2. utm_source if present                     → campaign-tagged traffic
//   3. referrer hostname pattern matching        → organic/social/AI search
//   4. fallback to "Direct"

export type LeadSource =
  | 'Facebook Ad' | 'Google Ad' | 'Bing Ad' | 'TikTok Ad'
  | 'Facebook' | 'Instagram' | 'Google' | 'Bing' | 'DuckDuckGo' | 'Brave' | 'TikTok' | 'YouTube'
  | 'LinkedIn' | 'Twitter' | 'Reddit' | 'Snapchat' | 'WhatsApp'
  | 'ChatGPT' | 'Perplexity' | 'Claude' | 'Gemini' | 'Copilot' | 'Meta AI' | 'DeepSeek' | 'Grok' | 'Google AI Overview'
  | 'Email' | 'Tawk.to' | 'Direct' | 'Repeat Order' | 'Referral' | 'Other';

const REFERRER_MAP: Array<[RegExp, LeadSource]> = [
  // AI search / LLMs — fastest growing source, list first
  [/chat\.?openai\.com|chatgpt\.com/i,        'ChatGPT'],
  [/perplexity\.ai/i,                         'Perplexity'],
  [/claude\.ai|anthropic\.com/i,              'Claude'],
  [/gemini\.google\.com|bard\.google\.com/i,  'Gemini'],
  [/copilot\.microsoft\.com|bing\.com\/chat/i,'Copilot'],
  [/meta\.ai/i,                               'Meta AI'],
  [/deepseek\.com/i,                          'DeepSeek'],
  // Grok listed before Social so x.com/i/grok wins over the Twitter x.com pattern
  [/grok\.com|\bx\.ai\b|x\.com\/i\/grok/i,    'Grok'],

  // Social
  [/facebook\.com|fb\.com|m\.facebook/i,       'Facebook'],
  [/instagram\.com/i,                          'Instagram'],
  [/tiktok\.com/i,                             'TikTok'],
  [/youtube\.com|youtu\.be/i,                  'YouTube'],
  [/linkedin\.com|lnkd\.in/i,                  'LinkedIn'],
  [/twitter\.com|x\.com|t\.co/i,               'Twitter'],
  [/reddit\.com/i,                             'Reddit'],
  [/snapchat\.com/i,                           'Snapchat'],

  // Search engines (organic)
  [/google\.[a-z.]+/i,                         'Google'],
  [/bing\.com/i,                               'Bing'],
  [/duckduckgo\.com|duck\.com/i,               'DuckDuckGo'],
  [/search\.brave\.com/i,                      'Brave'],

  // Messaging apps
  [/whatsapp\.com|wa\.me/i,                    'WhatsApp'],
  [/tawk\.to/i,                                'Tawk.to'],

  // Email clients
  [/mail\.google\.com|outlook\.live|outlook\.office/i, 'Email'],
];

const UTM_MAP: Record<string, LeadSource> = {
  facebook:   'Facebook',
  fb:         'Facebook',
  instagram:  'Instagram',
  ig:         'Instagram',
  google:     'Google',
  bing:       'Bing',
  duckduckgo: 'DuckDuckGo',
  ddg:        'DuckDuckGo',
  brave:      'Brave',
  tiktok:     'TikTok',
  youtube:    'YouTube',
  linkedin:   'LinkedIn',
  twitter:    'Twitter',
  reddit:     'Reddit',
  snapchat:   'Snapchat',
  email:      'Email',
  newsletter: 'Email',
  whatsapp:   'WhatsApp',
  chatgpt:    'ChatGPT',
  perplexity: 'Perplexity',
  claude:     'Claude',
  gemini:     'Gemini',
  copilot:    'Copilot',
  metaai:     'Meta AI',
  'meta.ai':  'Meta AI',
  deepseek:   'DeepSeek',
  grok:       'Grok',
  xai:        'Grok',
  // Google AI Overview clicks arrive as a plain google.com referrer, so it can't be told
  // apart from organic Google by referrer — only a UTM tag or a manual pick identifies it.
  aioverview:       'Google AI Overview',
  ai_overview:      'Google AI Overview',
  googleaioverview: 'Google AI Overview',
  sge:              'Google AI Overview',
};

export interface AttributionLike {
  attribution?: Record<string, any> | null;
  lead_source?: string | null;
  leadSource?: string | null;
  instructions?: string | null;
}

// Some agents type "Source: Facebook / Instagram" / "Source: Returning customer" into the order
// instructions on pay-link/phone orders (which carry no trackable referrer). Parse that tag so the
// real source isn't lost to "Direct". Mirrors the website's "How did you hear about us?" options.
function sourceFromInstructions(instructions?: string | null): LeadSource | null {
  if (!instructions) return null;
  const m = instructions.match(/source\s*:\s*([^|\n\r]+)/i);
  if (!m) return null;
  const v = m[1].trim().toLowerCase();
  const RULES: Array<[RegExp, LeadSource]> = [
    [/google\s*ad/,                             'Google Ad'],
    [/google/,                                  'Google'],
    [/facebook|instagram|\bfb\b|\big\b|meta/,   'Facebook'],
    [/chatgpt|openai/,                          'ChatGPT'],
    [/claude|anthropic/,                        'Claude'],
    [/perplexity/,                              'Perplexity'],
    [/gemini|bard/,                             'Gemini'],
    [/youtube/,                                 'YouTube'],
    [/reddit/,                                  'Reddit'],
    [/tiktok/,                                  'TikTok'],
    [/returning|repeat/,                        'Repeat Order'],
    [/friend|word of mouth|referral|recommend/, 'Referral'],
    [/other/,                                    'Other'],
  ];
  for (const [re, label] of RULES) if (re.test(v)) return label;
  return null;
}

/**
 * Resolve the most accurate source label for a quote/order.
 * Falls back to lead_source field, then 'Other'.
 */
export function detectLeadSource(input: AttributionLike): LeadSource {
  const attr = input.attribution ?? {};

  // 0. Definitive paid-AD signals straight off a Meta ad click (strongest of all):
  //    ad_id + ads_context come from the ad itself; referral_source='ADS' is the website's flag;
  //    utm_medium=paid/cpc names the channel as paid.
  const utmMedium = String(attr.utm_medium ?? '').toLowerCase().trim();
  const utmSrc    = String(attr.utm_source ?? '').toLowerCase().trim();
  const isPaidMedium = ['paid', 'cpc', 'ppc', 'paid_social', 'paidsocial'].includes(utmMedium);
  if (attr.ad_id || attr.ads_context || /^ads?$/i.test(String(attr.referral_source ?? '').trim())) {
    return 'Facebook Ad';
  }
  if (isPaidMedium) {
    if (/^(fb|facebook|ig|instagram|meta)/.test(utmSrc)) return 'Facebook Ad';
    if (/^(google|adwords|gads?)/.test(utmSrc))          return 'Google Ad';
    if (/^(bing|microsoft|msn)/.test(utmSrc))            return 'Bing Ad';
    if (/^(tiktok|tt)/.test(utmSrc))                     return 'TikTok Ad';
  }

  // 1. Paid ad click IDs — strong signal, came from a specific ad. Check the top-level fields AND
  //    the referrer/page_url query string: a Square pay-link the customer reached from a Facebook ad
  //    forwards ?fbclid=… into the pay-page referrer, which was leaking those orders into "Direct".
  const clickUrlBlob = `${String(attr.referrer ?? '')} ${String(attr.http_referer ?? '')} ${String(attr.page_url ?? '')}`;
  if (attr.fbclid  || /[?&]fbclid=/i.test(clickUrlBlob))  return 'Facebook Ad';
  if (attr.gclid   || /[?&]gclid=/i.test(clickUrlBlob))   return 'Google Ad';
  if (attr.msclkid || /[?&]msclkid=/i.test(clickUrlBlob)) return 'Bing Ad';
  if (attr.ttclid  || /[?&]ttclid=/i.test(clickUrlBlob))  return 'TikTok Ad';

  // Meta-chat sources (from conversations table merge)
  if (attr.source === 'meta_messenger')  return 'Facebook';
  if (attr.source === 'meta_instagram')  return 'Instagram';

  // 2. UTM source (campaign-tagged but not necessarily paid). utm_source may be a bare token
  //    ('fb') or a full domain ('chatgpt.com') — try the exact map, then the referrer patterns.
  const utm = utmSrc;
  if (utm) {
    if (UTM_MAP[utm]) return UTM_MAP[utm];
    for (const [pattern, label] of REFERRER_MAP) {
      if (pattern.test(utm)) return label;
    }
  }

  // 3. Manual lead_source pick — the agent asked the customer "how did you hear about us?" and
  //    selected it (or the website stored the customer's own answer). A DELIBERATE, human-confirmed
  //    source, so it BEATS the auto-detected referrer below: a customer who discovered us on ChatGPT
  //    and then brand-searched on Google has referrer=google.com, but the source they *told* us is
  //    ChatGPT. Page-name junk ("Pvc Product Page") isn't in the map, so it still falls through.
  const legacy = String(input.leadSource ?? input.lead_source ?? '').trim();
  if (legacy) {
    // Normalize manual labels to clean LeadSource values. Mirrors the lead-source dropdown
    // (constants/options.ts) so a hand-picked "Perplexity"/"Claude"/"DeepSeek"/"Meta AI"/etc.
    // isn't silently lost to "Direct".
    const lower = legacy.toLowerCase();
    const LEGACY_MAP: Record<string, LeadSource> = {
      'facebook': 'Facebook', 'fb': 'Facebook', 'facebook ad': 'Facebook Ad',
      'instagram': 'Instagram', 'ig': 'Instagram',
      'google': 'Google', 'google ad': 'Google Ad',
      'bing': 'Bing', 'bing ad': 'Bing Ad', 'microsoft': 'Bing',
      'duckduckgo': 'DuckDuckGo', 'ddg': 'DuckDuckGo', 'brave': 'Brave',
      'tiktok': 'TikTok', 'tiktok ad': 'TikTok Ad',
      'youtube': 'YouTube', 'linkedin': 'LinkedIn',
      'twitter': 'Twitter', 'x': 'Twitter',
      'reddit': 'Reddit', 'snapchat': 'Snapchat',
      'whatsapp': 'WhatsApp',
      'tawk.to': 'Tawk.to', 'tawk': 'Tawk.to',
      'chatgpt': 'ChatGPT', 'openai': 'ChatGPT',
      'perplexity': 'Perplexity',
      'claude': 'Claude', 'anthropic': 'Claude',
      'gemini': 'Gemini', 'bard': 'Gemini',
      'copilot': 'Copilot',
      'meta ai': 'Meta AI', 'metaai': 'Meta AI', 'meta.ai': 'Meta AI',
      'deepseek': 'DeepSeek',
      'grok': 'Grok', 'xai': 'Grok', 'x.ai': 'Grok',
      'google ai overview': 'Google AI Overview', 'ai overview': 'Google AI Overview',
      'aioverview': 'Google AI Overview', 'sge': 'Google AI Overview',
      'email': 'Email', 'newsletter': 'Email',
      'repeat order': 'Repeat Order', 'repeat': 'Repeat Order',
      'referral': 'Referral',
      'other': 'Other',
      'direct': 'Direct',
    };
    const mapped = LEGACY_MAP[lower];
    // A clean pick wins — but a literal "Direct" isn't a useful signal, so fall through.
    if (mapped && mapped !== 'Direct') return mapped;
  }

  // 4. Referrer hostname → organic/social/AI search (last-click). Fallback ONLY when there's no
  //    deliberate manual pick above — a brand-search referrer shouldn't override a stated source.
  const referrer = String(attr.referrer ?? attr.http_referer ?? '').toLowerCase();
  if (referrer) {
    for (const [pattern, label] of REFERRER_MAP) {
      if (pattern.test(referrer)) return label;
    }
  }

  // 5. Legacy "Source: X" tag some agents typed into the instructions field (manual attribution on
  //    pay-link / phone orders that carry no trackable referrer). Last resort before Direct.
  const fromInstructions = sourceFromInstructions(input.instructions);
  if (fromInstructions) return fromInstructions;

  // No signal at all → user typed URL or paid click ID was stripped
  return 'Direct';
}

// --- Traffic grouping (CLADB5) — collapse granular LeadSource labels into the report/chip
// buckets. "AI" groups every LLM/assistant source (the AI-influence view). ---
export type TrafficGroup =
  | 'Google Ads' | 'Google Organic' | 'Facebook' | 'Instagram' | 'AI' | 'Direct' | 'Other';

export const TRAFFIC_GROUPS: TrafficGroup[] = [
  'Google Ads', 'Google Organic', 'Facebook', 'Instagram', 'AI', 'Direct', 'Other',
];

export function groupTraffic(source: LeadSource): TrafficGroup {
  switch (source) {
    case 'Google Ad': return 'Google Ads';
    case 'Google': return 'Google Organic';
    case 'Facebook Ad':
    case 'Facebook': return 'Facebook';
    case 'Instagram': return 'Instagram';
    case 'ChatGPT': case 'Claude': case 'Grok': case 'Perplexity': case 'Gemini':
    case 'Copilot': case 'Meta AI': case 'DeepSeek': case 'Google AI Overview':
      return 'AI';
    case 'Direct': return 'Direct';
    default: return 'Other';
  }
}

// Resolve a quote/order into a traffic GROUP for the CLADB5 report + chips. Prefers the
// website's own `attribution.traffic_source` (e.g. "Google (Organic)", "Facebook Ads (id)",
// "Instagram Ads (id)", "Instagram"), normalizing its many string forms; falls back to
// detectLeadSource() (utm/referrer/click-id) when traffic_source is absent (older quotes,
// non-website quotes). This is CLADB5 Task 3's "normalize traffic values".
export function resolveTrafficGroup(
  input: AttributionLike,
): TrafficGroup {
  const ts = String(input.attribution?.traffic_source ?? '').toLowerCase().trim();
  if (ts) {
    if (ts.includes('google') && ts.includes('organic')) return 'Google Organic';
    if (ts.includes('google') && ts.includes('ad'))      return 'Google Ads';
    if (ts.includes('facebook'))                         return 'Facebook';   // "Facebook Ads (id)" or "Facebook"
    if (ts.includes('instagram'))                        return 'Instagram';  // "Instagram Ads (id)" or "Instagram"
    if (/chatgpt|claude|grok|perplexity|gemini|copilot|deepseek|meta ai/.test(ts)) return 'AI';
    if (ts.includes('direct'))                           return 'Direct';
    // Unknown traffic_source string → fall through to attribution/referrer resolution.
  }
  return groupTraffic(detectLeadSource(input));
}

// --- Heard-about (CLADB5) — self-reported "How did you hear about us?" answer. Persisted by
// the website into attribution.heard_about (new quotes); historical quotes embed it as
// "Source: X" in the instructions text. The literal option strings (all 4 forms identical):
export const HEARD_ABOUT_OPTIONS = [
  'Google Search', 'Google Ads', 'Facebook / Instagram', 'ChatGPT / Claude',
  'YouTube', 'Reddit', 'Friend / Word of mouth', 'Returning customer', 'Other',
] as const;
export type HeardAbout = typeof HEARD_ABOUT_OPTIONS[number];

// Historical fallback: recover heard_about from an "Source: X" line in the instructions, but
// ONLY accept X when it matches a known option (so a form name in "Source:" isn't misread).
function extractHeardFromInstructions(instructions?: string | null): string | null {
  const m = String(instructions ?? '').match(/Source:\s*([^\n\r]+)/i);
  return m ? m[1].trim() : null;
}

function normalizeHeard(raw: string): HeardAbout | null {
  const v = raw.trim();
  if (!v) return null;
  const match = HEARD_ABOUT_OPTIONS.find((o) => o.toLowerCase() === v.toLowerCase());
  return match ?? null; // unknown string from attribution → treat as free-text "Other" upstream
}

/** Resolve a quote's heard_about answer. attribution.heard_about wins; else the instructions
 *  "Source: X" fallback (known options only). Returns null when the customer left it blank. */
export function resolveHeardAbout(
  attribution: Record<string, any> | null | undefined,
  instructions?: string | null,
): HeardAbout | null {
  const attrRaw = String(attribution?.heard_about ?? '').trim();
  if (attrRaw) return normalizeHeard(attrRaw) ?? 'Other'; // present-but-unmatched = free-text Other
  const fromInstr = extractHeardFromInstructions(instructions);
  return fromInstr ? normalizeHeard(fromInstr) : null; // historical: only trust matched options
}

/** Sentinel sales_agent value for self-serve web-checkout orders (no human agent handled it). */
export const WEB_CHECKOUT_AGENT = 'WEB_CHECKOUT';

/** True when an order/quote came through the self-serve web checkout rather than a human agent. */
export function isWebCheckoutAgent(salesAgent?: string | null): boolean {
  return String(salesAgent ?? '').trim().toUpperCase() === WEB_CHECKOUT_AGENT;
}

/**
 * Lead-source label for display. For self-serve checkout orders we append
 * "/ Checkout" so the channel (web checkout, not an agent) shows next to the
 * real source — e.g. "ChatGPT / Checkout", "Brave / Checkout", "Direct / Checkout".
 * Non-checkout input just gets the plain resolved source.
 */
export function leadSourceDisplay(
  input: AttributionLike & { sales_agent?: string | null; salesAgent?: string | null }
): string {
  const source = detectLeadSource(input);
  const agent = input.salesAgent ?? input.sales_agent;
  return isWebCheckoutAgent(agent) ? `${source} / Checkout` : source;
}

/**
 * Tailwind classes for inline source badges (matches SOURCE_COLORS palette).
 * Returns the same color mapping logic the donut chart uses, kept in sync.
 */
export function getSourceBadgeClasses(source: LeadSource): string {
  const map: Record<LeadSource, string> = {
    'Facebook Ad':  'bg-blue-500/15 text-blue-300 border-blue-500/30',
    'Google Ad':    'bg-red-500/15 text-red-300 border-red-500/30',
    'Bing Ad':      'bg-teal-500/15 text-teal-300 border-teal-500/30',
    'TikTok Ad':    'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    'Facebook':     'bg-blue-500/15 text-blue-300 border-blue-500/30',
    'Instagram':    'bg-pink-500/15 text-pink-300 border-pink-500/30',
    'Google':       'bg-red-500/15 text-red-300 border-red-500/30',
    'Bing':         'bg-teal-500/15 text-teal-300 border-teal-500/30',
    'DuckDuckGo':   'bg-orange-500/15 text-orange-300 border-orange-500/30',
    'Brave':        'bg-orange-600/15 text-orange-200 border-orange-600/30',
    'TikTok':       'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    'YouTube':      'bg-red-600/15 text-red-300 border-red-600/30',
    'LinkedIn':     'bg-sky-500/15 text-sky-300 border-sky-500/30',
    'Twitter':      'bg-slate-500/15 text-slate-300 border-slate-500/30',
    'Reddit':       'bg-orange-500/15 text-orange-300 border-orange-500/30',
    'Snapchat':     'bg-yellow-400/15 text-yellow-300 border-yellow-400/30',
    'WhatsApp':     'bg-green-500/15 text-green-300 border-green-500/30',
    'ChatGPT':      'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    'Perplexity':   'bg-violet-500/15 text-violet-300 border-violet-500/30',
    'Claude':       'bg-orange-500/15 text-orange-300 border-orange-500/30',
    'Gemini':       'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    'Copilot':      'bg-blue-400/15 text-blue-200 border-blue-400/30',
    'Meta AI':      'bg-blue-600/15 text-blue-200 border-blue-600/30',
    'DeepSeek':     'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    'Grok':         'bg-zinc-400/15 text-zinc-200 border-zinc-400/30',
    'Google AI Overview': 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    'Email':        'bg-amber-500/15 text-amber-300 border-amber-500/30',
    'Tawk.to':      'bg-blue-600/15 text-blue-300 border-blue-600/30',
    'Direct':       'bg-purple-500/15 text-purple-300 border-purple-500/30',
    'Repeat Order': 'bg-brand-orange/15 text-brand-orange border-brand-orange/30',
    'Referral':     'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
    'Other':        'bg-slate-500/15 text-slate-300 border-slate-500/30',
  };
  return map[source] ?? map['Other'];
}
