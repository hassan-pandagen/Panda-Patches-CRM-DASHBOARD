import { describe, it, expect } from 'vitest';
import { detectLeadSource, isWebCheckoutAgent, leadSourceDisplay } from './leadSource';

// detectLeadSource is the single source of truth for attribution. It has an INLINE copy
// in the Square webhook (resolveLeadSource) that MUST agree — the precedence encoded here
// is what the funnel/lead-source reports and Meta CAPI credit depend on.

describe('detectLeadSource — precedence', () => {
  it('treats definitive paid-ad signals as Facebook Ad', () => {
    expect(detectLeadSource({ attribution: { ad_id: '123' } })).toBe('Facebook Ad');
    expect(detectLeadSource({ attribution: { ads_context: {} } })).toBe('Facebook Ad');
    expect(detectLeadSource({ attribution: { referral_source: 'ADS' } })).toBe('Facebook Ad');
  });

  it('classifies paid UTM medium by source', () => {
    expect(detectLeadSource({ attribution: { utm_medium: 'paid', utm_source: 'fb' } })).toBe('Facebook Ad');
    expect(detectLeadSource({ attribution: { utm_medium: 'cpc', utm_source: 'google' } })).toBe('Google Ad');
    expect(detectLeadSource({ attribution: { utm_medium: 'ppc', utm_source: 'bing' } })).toBe('Bing Ad');
    expect(detectLeadSource({ attribution: { utm_medium: 'paid_social', utm_source: 'tiktok' } })).toBe('TikTok Ad');
  });

  it('classifies paid click IDs', () => {
    expect(detectLeadSource({ attribution: { fbclid: 'x' } })).toBe('Facebook Ad');
    expect(detectLeadSource({ attribution: { gclid: 'x' } })).toBe('Google Ad');
    expect(detectLeadSource({ attribution: { msclkid: 'x' } })).toBe('Bing Ad');
    expect(detectLeadSource({ attribution: { ttclid: 'x' } })).toBe('TikTok Ad');
  });

  it('maps Meta-chat sources', () => {
    expect(detectLeadSource({ attribution: { source: 'meta_messenger' } })).toBe('Facebook');
    expect(detectLeadSource({ attribution: { source: 'meta_instagram' } })).toBe('Instagram');
  });

  it('resolves organic UTM source (token or domain)', () => {
    expect(detectLeadSource({ attribution: { utm_source: 'chatgpt' } })).toBe('ChatGPT');
    expect(detectLeadSource({ attribution: { utm_source: 'chatgpt.com' } })).toBe('ChatGPT');
    expect(detectLeadSource({ attribution: { utm_source: 'instagram' } })).toBe('Instagram');
    expect(detectLeadSource({ attribution: { utm_source: 'grok' } })).toBe('Grok');
  });

  it('resolves referrer hostnames, incl. AI search', () => {
    expect(detectLeadSource({ attribution: { referrer: 'https://chatgpt.com/' } })).toBe('ChatGPT');
    expect(detectLeadSource({ attribution: { referrer: 'https://www.google.com/search' } })).toBe('Google');
    expect(detectLeadSource({ attribution: { referrer: 'https://perplexity.ai/' } })).toBe('Perplexity');
    expect(detectLeadSource({ attribution: { referrer: 'https://grok.com/' } })).toBe('Grok');
    expect(detectLeadSource({ attribution: { referrer: 'https://x.ai/' } })).toBe('Grok');
  });

  it('classifies x.com/i/grok as Grok but plain x.com as Twitter', () => {
    expect(detectLeadSource({ attribution: { referrer: 'https://x.com/i/grok' } })).toBe('Grok');
    expect(detectLeadSource({ attribution: { referrer: 'https://x.com/somepost' } })).toBe('Twitter');
  });

  it('honors a manually-entered legacy lead_source', () => {
    expect(detectLeadSource({ lead_source: 'Perplexity' })).toBe('Perplexity');
    expect(detectLeadSource({ lead_source: 'Claude' })).toBe('Claude');
    expect(detectLeadSource({ lead_source: 'Facebook Ad' })).toBe('Facebook Ad');
    expect(detectLeadSource({ lead_source: 'Grok' })).toBe('Grok');
  });

  it('falls back to Direct — never "Checkout" — when there is no signal', () => {
    expect(detectLeadSource({})).toBe('Direct');
    expect(detectLeadSource({ attribution: {}, lead_source: '' })).toBe('Direct');
    // "Checkout" is the CHANNEL (sales_agent), not a source — it must never leak in here.
    expect(detectLeadSource({ lead_source: 'Checkout' })).not.toBe('Checkout');
  });

  it('prioritizes a paid ad click over a weaker referrer signal', () => {
    expect(detectLeadSource({ attribution: { fbclid: 'x', referrer: 'https://google.com' } })).toBe('Facebook Ad');
  });
});

describe('isWebCheckoutAgent', () => {
  it('detects the sentinel agent, case-insensitively', () => {
    expect(isWebCheckoutAgent('WEB_CHECKOUT')).toBe(true);
    expect(isWebCheckoutAgent('web_checkout')).toBe(true);
    expect(isWebCheckoutAgent('  WEB_CHECKOUT ')).toBe(true);
  });
  it('is false for real agents / empty', () => {
    expect(isWebCheckoutAgent('lance@pandapatches.com')).toBe(false);
    expect(isWebCheckoutAgent(null)).toBe(false);
    expect(isWebCheckoutAgent('')).toBe(false);
  });
});

describe('leadSourceDisplay', () => {
  it('appends "/ Checkout" for self-serve checkout orders', () => {
    expect(leadSourceDisplay({ attribution: { utm_source: 'chatgpt' }, sales_agent: 'WEB_CHECKOUT' }))
      .toBe('ChatGPT / Checkout');
    expect(leadSourceDisplay({ attribution: {}, sales_agent: 'WEB_CHECKOUT' }))
      .toBe('Direct / Checkout');
  });
  it('shows the plain source for agent-handled orders', () => {
    expect(leadSourceDisplay({ attribution: { gclid: 'x' }, sales_agent: 'lance@pandapatches.com' }))
      .toBe('Google Ad');
  });
});
