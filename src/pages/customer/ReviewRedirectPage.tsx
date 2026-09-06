// src/pages/customer/ReviewRedirectPage.tsx
// /r/:token — records that a review invite was clicked, then forwards to Trustpilot.
//
// WHY THIS EXISTS: the invite previously linked straight to a bare Trustpilot URL with
// no token, so 127 invites against +11 reviews was two unrelated numbers put side by
// side. There was no way to say what the invite earned. This is the smallest thing that
// makes it measurable.
//
// It records a CLICK, not a review. Whether someone actually posted is not knowable from
// our side without Trustpilot's API, and a click rate honestly labelled as such is worth
// more than a conversion rate that quietly is not one.
//
// The customer is mid-click in their email client, so nothing here may block them:
// the redirect fires on a short timer regardless of whether recording succeeded, and
// again immediately if it succeeds. Losing a data point is fine. Losing the review is not.

import React from 'react';
import { useParams } from 'react-router-dom';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Must match TRUSTPILOT_REVIEW_URL in supabase/functions/send-email/index.ts.
// /evaluate/ (write a review) rather than /review/ (read the profile) — confirmed
// deliberate: these customers have already bought, so the ask is unprompted-legitimate.
const TRUSTPILOT_URL = 'https://www.trustpilot.com/evaluate/pandapatches.com';

const ReviewRedirectPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();

  React.useEffect(() => {
    let done = false;
    const go = () => { if (!done) { done = true; window.location.replace(TRUSTPILOT_URL); } };

    // Hard ceiling. If the network is slow or the RPC is down, the customer still lands
    // on Trustpilot — the measurement is the thing we are willing to lose, never the review.
    const timer = setTimeout(go, 1200);

    fetch(`${SUPABASE_URL}/rest/v1/rpc/record_review_click`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_token: token }),
      keepalive: true,          // survives the navigation away
    })
      .catch(() => {})          // a failed record must never strand the customer here
      .finally(() => { clearTimeout(timer); go(); });

    return () => clearTimeout(timer);
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-brand-orange/30 border-t-brand-orange rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-300 text-sm">Taking you to Trustpilot…</p>
        <p className="text-slate-500 text-xs mt-3">
          Not moving?{' '}
          <a href={TRUSTPILOT_URL} className="text-brand-orange underline">Continue here</a>
        </p>
      </div>
    </div>
  );
};

export default ReviewRedirectPage;
