// MetaConnectionPanel — admin-only diagnostic panel for the Meta integration.
// Surfaces what would otherwise require Graph API Explorer / curl:
//   - Confirms which FB Page our token belongs to
//   - Shows which webhook fields the page is subscribed to
//   - One-click "Subscribe page" + "Disconnect page" buttons
//
// All Meta API calls go through the meta-admin edge function so the page
// access token never reaches the browser. Admin-role check enforced both
// in this UI (hides panel for non-admins) and in the edge function itself.

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../services/supabaseClient';
import { useToast } from '../../hooks/useToast';
import {
  CheckCircle2, XCircle, RefreshCw, Plug, Unplug, Loader2, ExternalLink,
} from 'lucide-react';

type MetaAdminAction = 'check_subscriptions' | 'subscribe_page' | 'unsubscribe_page' | 'page_info';

async function callMetaAdmin(action: MetaAdminAction) {
  const { data, error } = await supabase.functions.invoke('meta-admin', {
    body: { action },
  });
  if (error) throw new Error(error.message || `meta-admin failed`);
  return data;
}

const REQUIRED_FIELDS = ['messages', 'messaging_postbacks', 'messaging_referrals', 'message_deliveries'];

const MetaConnectionPanel: React.FC = () => {
  const queryClient = useQueryClient();
  const { success: showSuccess, error: showError } = useToast();
  const [showRawJson, setShowRawJson] = useState(false);

  const pageInfo = useQuery({
    queryKey: ['meta-admin', 'page_info'],
    queryFn: () => callMetaAdmin('page_info'),
    staleTime: 60_000,
    retry: false,
  });

  const subs = useQuery({
    queryKey: ['meta-admin', 'check_subscriptions'],
    queryFn: () => callMetaAdmin('check_subscriptions'),
    staleTime: 60_000,
    retry: false,
  });

  const subscribe = useMutation({
    mutationFn: () => callMetaAdmin('subscribe_page'),
    onSuccess: (data: any) => {
      if (data?.ok) {
        showSuccess('Page subscribed', 'Webhook events will now flow to the CRM.');
        queryClient.invalidateQueries({ queryKey: ['meta-admin'] });
      } else {
        showError('Subscribe failed', data?.meta_response?.error?.message || 'Unknown error');
      }
    },
    onError: (err: any) => showError('Subscribe failed', err?.message || 'Try again'),
  });

  const unsubscribe = useMutation({
    mutationFn: () => callMetaAdmin('unsubscribe_page'),
    onSuccess: (data: any) => {
      if (data?.ok) {
        showSuccess('Page disconnected', 'No further webhook events until you re-subscribe.');
        queryClient.invalidateQueries({ queryKey: ['meta-admin'] });
      } else {
        showError('Disconnect failed', data?.meta_response?.error?.message || 'Unknown error');
      }
    },
    onError: (err: any) => showError('Disconnect failed', err?.message || 'Try again'),
  });

  // ── Derive subscription status ──
  const subscribedAppData = subs.data?.meta_response?.data || [];
  const ourAppSub = subscribedAppData[0]; // when called with PAGE token, only our app is returned
  const subscribedFields: string[] = ourAppSub?.subscribed_fields || [];
  const missingFields = REQUIRED_FIELDS.filter(f => !subscribedFields.includes(f));
  const isFullySubscribed = subs.data?.ok && missingFields.length === 0 && subscribedFields.length > 0;
  const isPartiallySubscribed = subscribedFields.length > 0 && missingFields.length > 0;
  const isDisconnected = subs.data?.ok && subscribedFields.length === 0;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['meta-admin'] });
  };

  return (
    <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Meta / Facebook Page Connection</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Diagnostic and subscription controls for the Messenger / Instagram webhook.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={pageInfo.isFetching || subs.isFetching}
          className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all disabled:opacity-50"
          title="Refresh status"
        >
          <RefreshCw className={`w-4 h-4 ${(pageInfo.isFetching || subs.isFetching) ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* ── Page identity ─────────────────────────────── */}
        <Section title="Connected Page">
          {pageInfo.isLoading ? (
            <SkeletonRow />
          ) : pageInfo.error ? (
            <ErrorRow message={(pageInfo.error as any)?.message || 'Failed to load page info'} />
          ) : pageInfo.data?.ok ? (
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-white">
                  {pageInfo.data.meta_response.name}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Page ID: <span className="font-mono">{pageInfo.data.meta_response.id}</span>
                  {pageInfo.data.meta_response.username && (
                    <> · @{pageInfo.data.meta_response.username}</>
                  )}
                </div>
              </div>
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
          ) : (
            <ErrorRow message={pageInfo.data?.meta_response?.error?.message || 'Page lookup failed — check META_PAGE_ACCESS_TOKEN'} />
          )}
        </Section>

        {/* ── Subscription status ──────────────────────── */}
        <Section title="Webhook Subscription">
          {subs.isLoading ? (
            <SkeletonRow />
          ) : subs.error ? (
            <ErrorRow message={(subs.error as any)?.message || 'Failed to load subscriptions'} />
          ) : (
            <>
              {/* Status badge */}
              <div className="flex items-center gap-2 mb-3">
                {isFullySubscribed && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Fully connected
                  </span>
                )}
                {isPartiallySubscribed && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-300">
                    <XCircle className="w-3.5 h-3.5" /> Partial — re-subscribe needed
                  </span>
                )}
                {isDisconnected && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/15 text-red-300">
                    <XCircle className="w-3.5 h-3.5" /> Not subscribed
                  </span>
                )}
              </div>

              {/* Per-field status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {REQUIRED_FIELDS.map(field => {
                  const ok = subscribedFields.includes(field);
                  return (
                    <div
                      key={field}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
                        ok
                          ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-200'
                          : 'border-red-500/20 bg-red-500/5 text-red-200'
                      }`}
                    >
                      {ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                      <span className="font-mono">{field}</span>
                    </div>
                  );
                })}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => subscribe.mutate()}
                  disabled={subscribe.isPending || isFullySubscribed}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand-orange hover:bg-brand-orange/90 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-all"
                >
                  {subscribe.isPending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Plug className="w-4 h-4" />
                  }
                  {isFullySubscribed ? 'Already connected' : isPartiallySubscribed ? 'Re-subscribe' : 'Subscribe Page'}
                </button>
                {!isDisconnected && (
                  <button
                    onClick={() => {
                      if (confirm('Disconnect the page? Inbound DMs will stop reaching the CRM until you re-subscribe.')) {
                        unsubscribe.mutate();
                      }
                    }}
                    disabled={unsubscribe.isPending}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 hover:text-white border border-white/10 rounded-lg text-sm font-medium transition-all"
                  >
                    {unsubscribe.isPending
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Unplug className="w-4 h-4" />
                    }
                    Disconnect
                  </button>
                )}
              </div>
            </>
          )}
        </Section>

        {/* ── Raw JSON (collapsed by default) ──────────── */}
        <details
          open={showRawJson}
          onToggle={(e) => setShowRawJson((e.target as HTMLDetailsElement).open)}
          className="text-xs"
        >
          <summary className="cursor-pointer text-slate-400 hover:text-white select-none">
            Raw Meta API responses (debug)
          </summary>
          <div className="mt-2 space-y-2">
            <pre className="bg-slate-950/70 border border-white/5 rounded-lg p-3 text-[11px] text-slate-400 overflow-x-auto">
{JSON.stringify({ pageInfo: pageInfo.data, subscriptions: subs.data }, null, 2)}
            </pre>
          </div>
        </details>

        {/* ── Help link ──────────────────────────────── */}
        <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
          <span>If something looks wrong, check Meta App Dashboard:</span>
          <a
            href="https://developers.facebook.com/apps/4561266394199095/webhooks/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-slate-400 hover:text-white"
          >
            Webhook settings
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{title}</h3>
    {children}
  </div>
);

const SkeletonRow: React.FC = () => (
  <div className="flex items-center gap-2 text-sm text-slate-500">
    <Loader2 className="w-4 h-4 animate-spin" />
    Checking…
  </div>
);

const ErrorRow: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex items-start gap-2 px-3 py-2 bg-red-500/5 border border-red-500/20 rounded-lg text-xs text-red-200">
    <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
    <span>{message}</span>
  </div>
);

export default MetaConnectionPanel;
