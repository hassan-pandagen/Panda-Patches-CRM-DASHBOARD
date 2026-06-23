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
  | 'ChatGPT' | 'Perplexity' | 'Claude' | 'Gemini' | 'Copilot' | 'Meta AI' | 'DeepSeek'
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
};

export interface AttributionLike {
  attribution?: Record<string, any> | null;
  lead_source?: string | null;
  leadSource?: string | null;
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

  // 1. Paid ad click IDs — strong signal, came from a specific ad
  if (attr.fbclid)   return 'Facebook Ad';
  if (attr.gclid)    return 'Google Ad';
  if (attr.msclkid)  return 'Bing Ad';
  if (attr.ttclid)   return 'TikTok Ad';

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

  // 3. Referrer hostname → organic/social/AI search
  const referrer = String(attr.referrer ?? attr.http_referer ?? '').toLowerCase();
  if (referrer) {
    for (const [pattern, label] of REFERRER_MAP) {
      if (pattern.test(referrer)) return label;
    }
  }

  // 4. Legacy lead_source field (manual entry — agents typed/picked it from the dropdown)
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
      'email': 'Email', 'newsletter': 'Email',
      'repeat order': 'Repeat Order', 'repeat': 'Repeat Order',
      'referral': 'Referral',
      'other': 'Other',
      'direct': 'Direct',
    };
    if (LEGACY_MAP[lower]) return LEGACY_MAP[lower];
  }

  // No signal at all → user typed URL or paid click ID was stripped
  return 'Direct';
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
    'Email':        'bg-amber-500/15 text-amber-300 border-amber-500/30',
    'Tawk.to':      'bg-blue-600/15 text-blue-300 border-blue-600/30',
    'Direct':       'bg-purple-500/15 text-purple-300 border-purple-500/30',
    'Repeat Order': 'bg-brand-orange/15 text-brand-orange border-brand-orange/30',
    'Referral':     'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
    'Other':        'bg-slate-500/15 text-slate-300 border-slate-500/30',
  };
  return map[source] ?? map['Other'];
}
