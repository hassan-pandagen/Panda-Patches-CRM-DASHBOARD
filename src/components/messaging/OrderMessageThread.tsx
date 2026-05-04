// Shared message thread for customer ↔ agent communication on a single order.
// Used in both the customer portal (CustomerOrderDetail) and the staff CRM (OrderPage).
import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../services/supabaseClient';
import { Send, MessageSquare, User, ShieldCheck } from 'lucide-react';

interface OrderMessage {
  id: number;
  order_id: number;
  sender_type: 'customer' | 'agent' | 'system';
  sender_id: string | null;
  sender_name: string | null;
  sender_email: string | null;
  content: string;
  is_read_by_customer: boolean;
  is_read_by_agent: boolean;
  created_at: string;
}

interface Props {
  orderId: number;
  orderNumber: string;
  // Who is the current viewer? Decides sender_type on insert and which messages are marked read.
  viewer: 'customer' | 'agent';
  // Required for agent posts so we know who's replying
  currentUser?: {
    id: string;
    email?: string;
    name?: string;
  };
}

const OrderMessageThread: React.FC<Props> = ({ orderId, orderNumber, viewer, currentUser }) => {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch messages
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['order-messages', orderId],
    queryFn: async (): Promise<OrderMessage[]> => {
      const { data, error } = await supabase
        .from('order_messages')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!orderId,
    refetchInterval: 15000, // poll every 15s for near-realtime feel
  });

  // Mark unread messages as read for the current viewer
  useEffect(() => {
    if (!messages.length) return;
    const unreadIds = messages
      .filter(m => {
        if (viewer === 'customer') return m.sender_type === 'agent' && !m.is_read_by_customer;
        return m.sender_type === 'customer' && !m.is_read_by_agent;
      })
      .map(m => m.id);
    if (!unreadIds.length) return;

    const update: Partial<OrderMessage> = viewer === 'customer'
      ? { is_read_by_customer: true }
      : { is_read_by_agent: true };
    supabase
      .from('order_messages')
      .update(update)
      .in('id', unreadIds)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['order-messages', orderId] });
      });
  }, [messages, viewer, orderId, queryClient]);

  // Auto-scroll to latest
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Send message
  const sendMutation = useMutation({
    mutationFn: async () => {
      const content = draft.trim();
      if (!content) throw new Error('Message cannot be empty');
      if (content.length > 5000) throw new Error('Message too long (max 5000 characters)');

      const { error } = await supabase.from('order_messages').insert({
        order_id: orderId,
        sender_type: viewer,
        sender_id: currentUser?.id || null,
        sender_name: currentUser?.name || null,
        sender_email: currentUser?.email || null,
        content,
        // Sender automatically "reads" their own message
        is_read_by_customer: viewer === 'customer',
        is_read_by_agent: viewer === 'agent',
      });
      if (error) throw error;

      // Fire notification edge function (don't await — fire and forget)
      supabase.functions.invoke('notify-order-message', {
        body: {
          order_id: orderId,
          order_number: orderNumber,
          sender_type: viewer,
          sender_name: currentUser?.name || 'Customer',
          content,
        },
      }).catch(err => console.warn('[message] notify failed:', err));
    },
    onSuccess: () => {
      setDraft('');
      queryClient.invalidateQueries({ queryKey: ['order-messages', orderId] });
    },
  });

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!draft.trim() || sendMutation.isPending) return;
    sendMutation.mutate();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl + Enter to send
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/10 flex items-center gap-3">
        <div className="p-2 bg-brand-orange/10 rounded-lg">
          <MessageSquare className="w-4 h-4 text-brand-orange" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-white">
            {viewer === 'customer' ? 'Talk to Your Account Manager' : 'Customer Conversation'}
          </h3>
          <p className="text-xs text-slate-400 truncate">
            {viewer === 'customer'
              ? "We'll respond as soon as possible"
              : `Customer-facing thread for order ${orderNumber}`}
          </p>
        </div>
        {messages.length > 0 && (
          <span className="text-xs text-slate-500">
            {messages.length} {messages.length === 1 ? 'message' : 'messages'}
          </span>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="px-5 py-4 max-h-[400px] overflow-y-auto space-y-3"
      >
        {isLoading ? (
          <div className="text-center py-8 text-sm text-slate-500">Loading conversation…</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="w-10 h-10 text-slate-700 mx-auto mb-3" />
            <p className="text-sm text-slate-400">
              {viewer === 'customer'
                ? 'No messages yet — send a note about your order, and your account manager will reply.'
                : 'No customer messages yet.'}
            </p>
          </div>
        ) : (
          messages.map(msg => <MessageBubble key={msg.id} message={msg} viewer={viewer} />)
        )}
      </div>

      {/* Composer */}
      <form onSubmit={handleSend} className="border-t border-white/10 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              viewer === 'customer'
                ? 'Type your message…'
                : 'Reply to customer…'
            }
            rows={2}
            maxLength={5000}
            className="flex-1 bg-slate-800/50 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-orange/50 resize-none"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sendMutation.isPending}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-brand-orange hover:bg-brand-orange/90 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-all"
            title="Send (Cmd/Ctrl + Enter)"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Send</span>
          </button>
        </div>
        {sendMutation.isError && (
          <p className="text-xs text-red-400 mt-2">
            {(sendMutation.error as Error)?.message || 'Failed to send. Try again.'}
          </p>
        )}
        <p className="text-[10px] text-slate-600 mt-1.5 text-right">
          {draft.length}/5000 · Cmd/Ctrl + Enter to send
        </p>
      </form>
    </div>
  );
};

const MessageBubble: React.FC<{ message: OrderMessage; viewer: 'customer' | 'agent' }> = ({
  message,
  viewer,
}) => {
  const isOwn =
    (viewer === 'customer' && message.sender_type === 'customer') ||
    (viewer === 'agent' && message.sender_type === 'agent');
  const isSystem = message.sender_type === 'system';

  if (isSystem) {
    return (
      <div className="text-center py-2">
        <span className="inline-block text-[11px] text-slate-500 italic px-3 py-1 bg-slate-800/40 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  const senderLabel =
    message.sender_type === 'agent'
      ? viewer === 'customer'
        ? 'Account Manager' // never reveal agent's email/name to customer
        : message.sender_name || message.sender_email || 'Agent'
      : message.sender_name || 'Customer';

  return (
    <div className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
          message.sender_type === 'agent' ? 'bg-brand-orange/20' : 'bg-blue-400/20'
        }`}
      >
        {message.sender_type === 'agent' ? (
          <ShieldCheck className="w-3.5 h-3.5 text-brand-orange" />
        ) : (
          <User className="w-3.5 h-3.5 text-blue-400" />
        )}
      </div>
      <div className={`max-w-[80%] ${isOwn ? 'text-right' : ''}`}>
        <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-1">
          <span className="font-medium">{senderLabel}</span>
          <span>·</span>
          <span>{formatTime(message.created_at)}</span>
        </div>
        <div
          className={`inline-block px-3 py-2 rounded-xl text-sm whitespace-pre-wrap break-words text-left ${
            isOwn
              ? 'bg-brand-orange text-white rounded-br-md'
              : 'bg-slate-800 text-slate-100 rounded-bl-md'
          }`}
        >
          {message.content}
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
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString())
    return `Yesterday ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

export default OrderMessageThread;
