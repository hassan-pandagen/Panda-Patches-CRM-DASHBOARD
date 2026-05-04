// MetaChatPanel — shows on Quote detail when the quote originated from Messenger or Instagram DM.
// Displays: channel badge, ad attribution badge, full message history, "Open in Business Suite" deep link.
// Reps reply via Business Suite (Meta's tool) — we record inbound messages here for context only.

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../services/supabaseClient';
import {
  MessageSquare, Instagram, Megaphone, ExternalLink, User, Image as ImageIcon,
} from 'lucide-react';

interface Props {
  quoteId: number;
  quote: any; // Full quote row with Meta fields
}

const MetaChatPanel: React.FC<Props> = ({ quoteId, quote }) => {
  // Don't render if not a Meta-sourced lead
  if (!quote?.meta_psid && !quote?.meta_ig_id) return null;

  const channel: 'messenger' | 'instagram' = quote.meta_channel || 'messenger';
  const isFromAd = !!quote.meta_ad_id;

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['meta-messages', quoteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meta_messages')
        .select('*')
        .eq('quote_id', quoteId)
        .order('received_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!quoteId,
    refetchInterval: 30000,
  });

  const businessSuiteUrl =
    channel === 'instagram'
      ? 'https://business.facebook.com/latest/inbox/instagram'
      : 'https://business.facebook.com/latest/inbox/messenger';

  return (
    <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/10">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg ${
                channel === 'instagram'
                  ? 'bg-gradient-to-br from-pink-500/20 to-purple-500/20'
                  : 'bg-blue-500/15'
              }`}
            >
              {channel === 'instagram' ? (
                <Instagram className="w-4 h-4 text-pink-400" />
              ) : (
                <MessageSquare className="w-4 h-4 text-blue-400" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white capitalize">
                {channel} Conversation
              </h3>
              <p className="text-xs text-slate-400">
                {messages.length} {messages.length === 1 ? 'message' : 'messages'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isFromAd && (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-brand-orange/15 text-brand-orange"
                title={`Ad ID: ${quote.meta_ad_id}`}
              >
                <Megaphone className="w-3 h-3" />
                From Ad
              </span>
            )}

            <a
              href={businessSuiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium rounded-lg transition-all"
            >
              <ExternalLink className="w-3 h-3" />
              Reply in Business Suite
            </a>
          </div>
        </div>

        {isFromAd && (
          <div className="mt-3 bg-brand-orange/5 border border-brand-orange/20 rounded-lg p-2.5 text-xs text-brand-orange/90">
            <p className="font-medium mb-0.5">📱 Click-to-Message Ad attribution</p>
            <p className="text-brand-orange/70">
              Ad ID: <span className="font-mono">{quote.meta_ad_id}</span>
              {quote.meta_ad_creative_id && (
                <> · Creative: <span className="font-mono">{quote.meta_ad_creative_id}</span></>
              )}
            </p>
            <p className="text-brand-orange/70 mt-1">
              CAPI Lead event was fired with ctwa_clid → fbc for ad attribution.
            </p>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="px-5 py-4 max-h-[500px] overflow-y-auto space-y-3">
        {isLoading ? (
          <div className="text-center py-6 text-sm text-slate-500">Loading conversation…</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-6">
            <MessageSquare className="w-8 h-8 text-slate-700 mx-auto mb-2 opacity-50" />
            <p className="text-sm text-slate-400">No messages yet.</p>
          </div>
        ) : (
          messages.map((msg: any) => (
            <MessageBubble key={msg.id} message={msg} customerName={quote.customer_name} />
          ))
        )}
      </div>

      {/* Footer note */}
      <div className="px-5 py-3 border-t border-white/10 bg-slate-900/40">
        <p className="text-[11px] text-slate-500">
          💡 Reply to this customer in <strong className="text-slate-400">Meta Business Suite</strong>.
          Inbound messages auto-log here for context. Outbound messages are not tracked.
        </p>
      </div>
    </div>
  );
};

const MessageBubble: React.FC<{ message: any; customerName: string }> = ({ message, customerName }) => {
  const isInbound = message.direction === 'inbound';
  const hasAttachments = Array.isArray(message.attachments) && message.attachments.length > 0;

  return (
    <div className={`flex gap-2 ${isInbound ? '' : 'flex-row-reverse'}`}>
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
          isInbound ? 'bg-blue-400/20' : 'bg-brand-orange/20'
        }`}
      >
        <User className={`w-3.5 h-3.5 ${isInbound ? 'text-blue-400' : 'text-brand-orange'}`} />
      </div>
      <div className={`max-w-[80%] ${isInbound ? '' : 'text-right'}`}>
        <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-1">
          <span className="font-medium">
            {isInbound ? customerName || 'Customer' : 'Panda Patches Team'}
          </span>
          <span>·</span>
          <span>{formatTime(message.received_at)}</span>
        </div>
        <div
          className={`inline-block px-3 py-2 rounded-xl text-sm whitespace-pre-wrap break-words text-left ${
            isInbound
              ? 'bg-slate-800 text-slate-100 rounded-bl-md'
              : 'bg-brand-orange text-white rounded-br-md'
          }`}
        >
          {message.text || <span className="italic text-slate-400">(no text)</span>}
          {hasAttachments && (
            <div className="mt-2 flex items-center gap-1.5 text-xs opacity-75">
              <ImageIcon className="w-3 h-3" />
              {message.attachments.length} attachment{message.attachments.length === 1 ? '' : 's'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const formatTime = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

export default MetaChatPanel;
