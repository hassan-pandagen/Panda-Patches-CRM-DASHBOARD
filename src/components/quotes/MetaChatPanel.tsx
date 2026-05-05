// MetaChatPanel — shows on Quote detail when the quote originated from Messenger or Instagram DM.
// Displays: channel badge, ad attribution badge, full message history, inline reply composer.
// Reps can reply directly from CRM via send-meta-message edge function.

import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../services/supabaseClient';
import { useToast } from '../../hooks/useToast';
import {
  MessageSquare, Instagram, Megaphone, ExternalLink, User, Image as ImageIcon,
  Send, AlertTriangle,
} from 'lucide-react';

// Meta requires a tag for messages sent >24h after the customer's last inbound.
// POST_PURCHASE_UPDATE covers most CRM use cases ("your patches shipped",
// "ready for QA approval"). HUMAN_AGENT covers ad-hoc human follow-ups.
type MessageTag = 'POST_PURCHASE_UPDATE' | 'CONFIRMED_EVENT_UPDATE' | 'ACCOUNT_UPDATE' | 'HUMAN_AGENT';

const TAG_OPTIONS: { id: MessageTag; label: string; hint: string }[] = [
  { id: 'POST_PURCHASE_UPDATE',    label: 'Post-Purchase Update', hint: 'Order/shipping status updates' },
  { id: 'CONFIRMED_EVENT_UPDATE',  label: 'Confirmed Event',      hint: 'Reminders for confirmed appointments' },
  { id: 'ACCOUNT_UPDATE',          label: 'Account Update',       hint: 'Customer profile or account changes' },
  { id: 'HUMAN_AGENT',             label: 'Human Agent',          hint: 'Live agent follow-up within 7 days' },
];

interface Props {
  quoteId: number;
  quote: any; // Full quote row with Meta fields
}

const MetaChatPanel: React.FC<Props> = ({ quoteId, quote }) => {
  // Don't render if not a Meta-sourced lead
  if (!quote?.meta_psid && !quote?.meta_ig_id) return null;

  const channel: 'messenger' | 'instagram' = quote.meta_channel || 'messenger';
  const isFromAd = !!quote.meta_ad_id;

  const queryClient = useQueryClient();
  const { success: showSuccess, error: showError } = useToast();
  const [replyText, setReplyText] = useState('');
  const [selectedTag, setSelectedTag] = useState<MessageTag>('POST_PURCHASE_UPDATE');
  const lastSendAtRef = useRef<number>(0); // 250ms throttle (Meta per-page rate limit)

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

  // Compute whether we're inside Meta's 24h freeform messaging window.
  // Outside the window, Meta requires a MESSAGE_TAG (POST_PURCHASE_UPDATE etc).
  const lastInboundMs = useMemo(() => {
    const lastInbound = [...messages].reverse().find((m: any) => m.direction === 'inbound');
    return lastInbound ? new Date(lastInbound.received_at).getTime() : 0;
  }, [messages]);

  const hoursSinceInbound = lastInboundMs > 0 ? (Date.now() - lastInboundMs) / 3_600_000 : Infinity;
  const insideWindow = hoursSinceInbound < 24;

  const businessSuiteUrl =
    channel === 'instagram'
      ? 'https://business.facebook.com/latest/inbox/instagram'
      : 'https://business.facebook.com/latest/inbox/messenger';

  const sendMessage = useMutation({
    mutationFn: async () => {
      const text = replyText.trim();
      if (!text) throw new Error('Message is empty');
      if (text.length > 2000) throw new Error('Message exceeds 2000 characters');

      // 250ms throttle (Meta per-page rate limit ~40 msgs/sec)
      const since = Date.now() - lastSendAtRef.current;
      if (since < 250) {
        await new Promise(r => setTimeout(r, 250 - since));
      }
      lastSendAtRef.current = Date.now();

      const body: any = { quote_id: quoteId, text };
      if (!insideWindow) body.tag = selectedTag;

      const { data, error } = await supabase.functions.invoke('send-meta-message', { body });
      if (error || data?.error) {
        throw new Error(data?.error || error?.message || 'Failed to send message');
      }
      return data;
    },
    onSuccess: () => {
      setReplyText('');
      showSuccess('Message sent');
      queryClient.invalidateQueries({ queryKey: ['meta-messages', quoteId] });
    },
    onError: (err: any) => showError('Send failed', err?.message || 'Try again'),
  });

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

      {/* Reply composer */}
      <div className="border-t border-white/10 bg-slate-900/40">
        {/* Outside-window banner with tag selector */}
        {!insideWindow && (
          <div className="px-5 py-3 bg-amber-500/5 border-b border-amber-500/20">
            <div className="flex items-start gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-200">
                <p className="font-medium mb-0.5">Outside 24h window</p>
                <p className="text-amber-200/70">
                  {lastInboundMs === 0
                    ? 'Customer has not messaged yet — pick a message tag.'
                    : `Last reply was ${Math.round(hoursSinceInbound)}h ago. Pick a message tag below.`}
                </p>
              </div>
            </div>
            <select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value as MessageTag)}
              className="w-full px-3 py-2 bg-slate-800 border border-amber-500/30 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500/60"
            >
              {TAG_OPTIONS.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.label} — {opt.hint}</option>
              ))}
            </select>
          </div>
        )}

        <div className="p-3">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                if (replyText.trim() && !sendMessage.isPending) sendMessage.mutate();
              }
            }}
            placeholder={insideWindow
              ? `Reply to ${quote.customer_name || 'customer'}…  (Cmd+Enter to send)`
              : `Send tagged message…  (Cmd+Enter to send)`}
            rows={2}
            maxLength={2000}
            className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-orange/50 resize-none"
          />
          <div className="flex items-center justify-between mt-2">
            <p className="text-[10px] text-slate-500">
              {replyText.length}/2000 · sent via Meta {channel === 'instagram' ? 'Instagram' : 'Messenger'}
            </p>
            <button
              onClick={() => sendMessage.mutate()}
              disabled={!replyText.trim() || sendMessage.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-orange hover:bg-brand-orange/90 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium transition-all"
            >
              <Send className="w-3 h-3" />
              {sendMessage.isPending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>

        <div className="px-5 py-2 border-t border-white/5 flex items-center justify-between">
          <p className="text-[10px] text-slate-500">
            💡 Replies sync to {channel === 'instagram' ? 'Instagram' : 'Messenger'}.
          </p>
          <a
            href={businessSuiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-slate-500 hover:text-slate-300 inline-flex items-center gap-1"
          >
            Or open in Business Suite
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
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
