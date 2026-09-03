// src/pages/customer/ColourMatchPage.tsx
// Public, unauthenticated colour-confirmation page — /colour-match/:token
//
// Chenille letter/number packages have no mockup cycle, so this page IS the approval
// step. Whatever the customer clicks here is the last thing that happens before yarn
// is cut, which is why it shows their own words back to them rather than only our
// answer: the question being asked is "did we read you right", not "is this nice".
//
// Reads through get_colour_match_token (SECURITY DEFINER, anon-executable) instead of
// selecting orders directly — the anon key ships in this bundle, so a direct read would
// expose the table. The RPC returns one row by token and only the fields rendered here:
// no name, no email, no address, no money, no sales agent. The unguessable token is the
// capability, same model as /pay/:token.
//
// Approving calls respond_to_colour_match, which copies colour_proposed_yarn into
// matched_yarn. It cannot set an arbitrary yarn, cannot act with no proposal on the row,
// and is idempotent — a second click reports the standing answer rather than flipping it.

import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X, Loader, AlertCircle } from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const rpc = async (fn: string, body: Record<string, unknown>) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Something went wrong. Please try again.');
  return res.json();
};

interface TokenRow {
  order_number: string;
  design_name: string | null;
  patches_quantity: number | null;
  patches_type: string | null;
  customer_colour_input: string | null;
  customer_colour_hex: string | null;
  colour_proposed_yarn: string | null;
  colour_customer_response: 'approved' | 'changes_requested' | null;
  colour_customer_responded_at: string | null;
  matched_yarn: string | null;
}

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
    <div className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl">
      {children}
    </div>
  </div>
);

const ColourMatchPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<TokenRow>({
    queryKey: ['colour-match', token],
    queryFn: async () => {
      const rows = await rpc('get_colour_match_token', { p_token: token });
      if (!Array.isArray(rows) || rows.length === 0) throw new Error('This link is not valid.');
      return rows[0];
    },
    enabled: !!token,
    retry: 1,
  });

  const respond = useMutation({
    mutationFn: (approved: boolean) => rpc('respond_to_colour_match', { p_token: token, p_approved: approved }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['colour-match', token] }),
  });

  if (isLoading) {
    return (
      <Shell>
        <div className="flex items-center justify-center gap-3 text-slate-400 py-8">
          <Loader className="w-5 h-5 animate-spin" /> Loading your order…
        </div>
      </Shell>
    );
  }

  if (error || !data) {
    return (
      <Shell>
        <div className="text-center py-6">
          <AlertCircle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-white">This link isn&apos;t valid</h1>
          <p className="text-slate-400 mt-2 text-sm">
            It may have been replaced by a newer one. Please check your most recent email from us,
            or reply to it and we&apos;ll sort it out.
          </p>
        </div>
      </Shell>
    );
  }

  const answered = !!data.colour_customer_response;
  const approved = data.colour_customer_response === 'approved';

  if (answered) {
    return (
      <Shell>
        <div className="text-center py-4">
          <div className={`w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center ${
            approved ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
          }`}>
            {approved ? <Check className="w-6 h-6" /> : <X className="w-6 h-6" />}
          </div>
          <h1 className="text-xl font-bold text-white">
            {approved ? 'Thank you — that’s confirmed' : 'Thanks for letting us know'}
          </h1>
          <p className="text-slate-400 mt-2 text-sm">
            {approved
              ? <>We&apos;re making <strong className="text-white">{data.matched_yarn}</strong> for order {data.order_number}. Nothing more is needed from you.</>
              : <>We won&apos;t start order {data.order_number}. Someone from our team will be in touch with another option shortly.</>}
          </p>
        </div>
      </Shell>
    );
  }

  if (!data.colour_proposed_yarn) {
    return (
      <Shell>
        <div className="text-center py-6">
          <AlertCircle className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-white">Nothing to confirm just yet</h1>
          <p className="text-slate-400 mt-2 text-sm">
            We&apos;re still picking the closest yarn for order {data.order_number}. You&apos;ll get an
            email the moment it&apos;s ready.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-white">Quick check on your colour</h1>
        <p className="text-slate-400 mt-2 text-sm">
          Order {data.order_number}
          {data.design_name ? ` · ${data.design_name}` : ''}
          {data.patches_quantity ? ` · ${data.patches_quantity} pieces` : ''}
        </p>
        <p className="text-slate-400 mt-3 text-sm">
          These are made to your colour with no mockup step, so we&apos;d rather ask than guess.
          Nothing is cut until you confirm.
        </p>
      </div>

      <div className="rounded-xl border border-white/10 divide-y divide-white/10 overflow-hidden">
        <div className="p-4">
          <div className="text-xs uppercase tracking-wider text-slate-400 font-bold">You asked for</div>
          <div className="mt-2 flex items-center gap-2">
            {data.customer_colour_hex && (
              <span
                className="w-7 h-7 rounded border border-white/20 shrink-0"
                style={{ backgroundColor: data.customer_colour_hex }}
              />
            )}
            <span className="text-lg font-bold text-white break-words">
              {data.customer_colour_input || '—'}
            </span>
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs uppercase tracking-wider text-slate-400 font-bold">Our closest yarn</div>
          <div className="mt-2 text-lg font-bold text-brand-orange break-words">
            {data.colour_proposed_yarn}
          </div>
        </div>
      </div>

      {respond.isError && (
        <p className="mt-4 text-sm text-red-400 text-center">
          {(respond.error as Error)?.message || 'Something went wrong. Please try again.'}
        </p>
      )}

      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          disabled={respond.isPending}
          onClick={() => respond.mutate(true)}
          className="flex-1 bg-brand-orange hover:bg-orange-500 disabled:opacity-60 text-white font-bold rounded-xl px-5 py-4 transition-colors flex items-center justify-center gap-2"
        >
          <Check className="w-5 h-5" /> Yes, that&apos;s right
        </button>
        <button
          type="button"
          disabled={respond.isPending}
          onClick={() => respond.mutate(false)}
          className="flex-1 border border-slate-600 hover:border-slate-400 disabled:opacity-60 text-slate-300 hover:text-white font-bold rounded-xl px-5 py-4 transition-colors flex items-center justify-center gap-2"
        >
          <X className="w-5 h-5" /> Not quite
        </button>
      </div>

      <p className="mt-4 text-xs text-slate-500 text-center">
        Either answer is fine — &ldquo;not quite&rdquo; just means someone will get in touch with another option.
      </p>
    </Shell>
  );
};

export default ColourMatchPage;
