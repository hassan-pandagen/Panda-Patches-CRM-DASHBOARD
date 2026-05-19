// src/pages/InboxPage.tsx
// Shared inbox for Messenger + Instagram DM conversations.
// Layout: conversation list (left) + selected conversation thread + composer (right).
//
// Composer modes:
//   Reply  — sends via Meta Graph API (send-meta-message edge fn)
//   Note   — saves an internal-only meta_message (is_internal_note=true, never sent to customer)
//
// v2 features:
//   - Convert to Quote button — creates a Quote pre-filled from the conversation
//   - Internal notes — private team notes visible only in CRM
//   - Close / Reopen conversation

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { sanitizeIlikePattern } from '../utils/supabaseFilters';
import {
  MessageSquare, Instagram, Megaphone, Send, AlertTriangle,
  User, Image as ImageIcon, ChevronDown, Check, RefreshCw, X,
  Lock, FileText, ExternalLink, Pencil, Phone, Mail, Search,
  Package, DollarSign,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Conversation {
  id: number;
  channel: 'messenger' | 'instagram';
  meta_psid: string | null;
  meta_ig_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_profile_pic: string | null;
  meta_ad_id: string | null;
  meta_ctwa_clid: string | null;
  attribution: Record<string, any> | null;
  assignee_user_id: string | null;
  status: 'open' | 'closed';
  promoted_quote_id: number | null;
  promoted_to_order_id: number | null;
  agreed_price: number | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_direction: 'inbound' | 'outbound' | null;
  unread_count: number;
  created_at: string;
}

interface MetaMessage {
  id: number;
  conversation_id: number;
  direction: 'inbound' | 'outbound';
  channel: string;
  meta_message_id: string | null;
  text: string | null;
  attachments: any;
  received_at: string;
  sender_email: string | null;
  is_internal_note: boolean;
}

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
}

type FilterTab = 'all' | 'mine' | 'unassigned' | 'closed';
type ComposerMode = 'reply' | 'note';
type MessageTag = 'POST_PURCHASE_UPDATE' | 'CONFIRMED_EVENT_UPDATE' | 'ACCOUNT_UPDATE' | 'HUMAN_AGENT';

const TAG_OPTIONS: { id: MessageTag; label: string; hint: string }[] = [
  { id: 'POST_PURCHASE_UPDATE',   label: 'Post-Purchase Update', hint: 'Order/shipping status updates' },
  { id: 'CONFIRMED_EVENT_UPDATE', label: 'Confirmed Event',      hint: 'Reminders for confirmed appointments' },
  { id: 'ACCOUNT_UPDATE',         label: 'Account Update',       hint: 'Customer profile or account changes' },
  { id: 'HUMAN_AGENT',            label: 'Human Agent',          hint: 'Live agent follow-up within 7 days' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatFullTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ─── Conversation List Item ───────────────────────────────────────────────────

const ConvItem: React.FC<{
  conv: Conversation;
  selected: boolean;
  assigneeName?: string;
  onClick: () => void;
}> = ({ conv, selected, assigneeName, onClick }) => {
  const isInstagram = conv.channel === 'instagram';
  const hasUnread = conv.unread_count > 0 && conv.last_message_direction === 'inbound';

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-white/5 transition-all hover:bg-white/5 ${
        selected ? 'bg-brand-orange/10 border-l-2 border-l-brand-orange' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`relative shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold ${
          isInstagram ? 'bg-gradient-to-br from-pink-500/30 to-purple-500/30 text-pink-300'
                      : 'bg-blue-500/20 text-blue-300'
        }`}>
          {conv.customer_name ? conv.customer_name.charAt(0).toUpperCase() : '?'}
          <span className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center ${
            isInstagram ? 'bg-gradient-to-br from-pink-500 to-purple-600' : 'bg-[#0084ff]'
          }`}>
            {isInstagram
              ? <Instagram className="w-2.5 h-2.5 text-white" />
              : <MessageSquare className="w-2.5 h-2.5 text-white" />}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <p className={`text-sm truncate ${hasUnread ? 'font-semibold text-white' : 'font-medium text-slate-200'}`}>
              {conv.customer_name || 'Unknown'}
            </p>
            <div className="flex items-center gap-1.5 shrink-0">
              {conv.meta_ad_id && <Megaphone className="w-3 h-3 text-brand-orange" />}
              {conv.promoted_quote_id && <span title="Converted to quote"><FileText className="w-3 h-3 text-green-400" /></span>}
              {conv.last_message_at && (
                <span className="text-[10px] text-slate-500">{formatTime(conv.last_message_at)}</span>
              )}
            </div>
          </div>
          <p className={`text-xs truncate mt-0.5 ${hasUnread ? 'text-slate-300' : 'text-slate-500'}`}>
            {conv.last_message_direction === 'outbound' && <span className="text-brand-orange mr-1">You:</span>}
            {conv.last_message_preview || <em>No messages yet</em>}
          </p>
          {assigneeName && (
            <p className="text-[10px] text-slate-600 mt-0.5 truncate">{assigneeName}</p>
          )}
        </div>

        {hasUnread && (
          <span className="shrink-0 mt-1 min-w-[18px] h-[18px] rounded-full bg-brand-orange text-white text-[10px] font-bold flex items-center justify-center px-1">
            {conv.unread_count > 9 ? '9+' : conv.unread_count}
          </span>
        )}
      </div>
    </button>
  );
};

// ─── Message Bubble ───────────────────────────────────────────────────────────

const MessageBubble: React.FC<{ message: MetaMessage; customerName: string | null }> = ({ message, customerName }) => {
  const isInbound = message.direction === 'inbound';
  const isNote = message.is_internal_note;
  const hasAttachments = Array.isArray(message.attachments) && message.attachments.length > 0;

  if (isNote) {
    return (
      <div className="flex justify-center">
        <div className="max-w-[85%] bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
          <div className="flex items-center gap-1.5 text-[10px] text-amber-400/70 mb-1">
            <Lock className="w-2.5 h-2.5" />
            <span>Internal note · {message.sender_email?.split('@')[0] || 'Team'} · {formatFullTime(message.received_at)}</span>
          </div>
          <p className="text-xs text-amber-200 whitespace-pre-wrap break-words">{message.text}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-2 ${isInbound ? '' : 'flex-row-reverse'}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
        isInbound ? 'bg-blue-400/20' : 'bg-brand-orange/20'
      }`}>
        <User className={`w-3.5 h-3.5 ${isInbound ? 'text-blue-400' : 'text-brand-orange'}`} />
      </div>
      <div className={`max-w-[75%] ${isInbound ? '' : 'text-right'}`}>
        <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-1">
          <span className="font-medium">
            {isInbound
              ? (customerName || 'Customer')
              : (message.sender_email ? message.sender_email.split('@')[0] : 'Panda Patches')}
          </span>
          <span>·</span>
          <span>{formatFullTime(message.received_at)}</span>
        </div>
        <div className={`inline-block px-3 py-2 rounded-xl text-sm whitespace-pre-wrap break-words text-left ${
          isInbound
            ? 'bg-slate-800 text-slate-100 rounded-bl-md'
            : 'bg-brand-orange text-white rounded-br-md'
        }`}>
          {message.text || <span className="italic text-slate-400 text-xs">(no text)</span>}
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

// ─── Assignee Dropdown ────────────────────────────────────────────────────────

const AssigneeDropdown: React.FC<{
  convId: number;
  currentAssigneeId: string | null;
  agents: UserProfile[];
  onAssigned: () => void;
}> = ({ convId, currentAssigneeId, agents, onAssigned }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { error: showError } = useToast();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const assign = async (userId: string | null) => {
    setOpen(false);
    const { error } = await supabase
      .from('conversations')
      .update({ assignee_user_id: userId, updated_at: new Date().toISOString() })
      .eq('id', convId);
    if (error) showError('Failed to assign', error.message);
    else onAssigned();
  };

  const current = agents.find(a => a.id === currentAssigneeId);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded-lg text-xs text-slate-300 transition-all"
      >
        <User className="w-3 h-3" />
        {current ? current.full_name || current.email.split('@')[0] : 'Unassigned'}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-slate-800 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
          <button
            onClick={() => assign(null)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:bg-white/5 transition-all"
          >
            {!currentAssigneeId && <Check className="w-3 h-3 text-brand-orange" />}
            <span className={!currentAssigneeId ? '' : 'ml-4'}>Unassigned</span>
          </button>
          {agents.map(agent => (
            <button
              key={agent.id}
              onClick={() => assign(agent.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-white/5 transition-all"
            >
              {currentAssigneeId === agent.id && <Check className="w-3 h-3 text-brand-orange shrink-0" />}
              <span className={currentAssigneeId === agent.id ? '' : 'ml-4'}>
                {agent.full_name || agent.email.split('@')[0]}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Customer Info Edit Modal ─────────────────────────────────────────────────
// Lets agents fill in real customer details (name, email, phone) after they ask
// the customer in chat. Critical because Meta's API returns "Meta messenger user"
// without app-review approval for the pages_user_name permission.
// Better customer data → better CAPI EMQ → better ad attribution.

const CustomerInfoModal: React.FC<{
  conv: Conversation;
  onClose: () => void;
  onSaved: () => void;
}> = ({ conv, onClose, onSaved }) => {
  const [name, setName] = useState(conv.customer_name ?? '');
  const [email, setEmail] = useState(conv.customer_email ?? '');
  const [phone, setPhone] = useState(conv.customer_phone ?? '');
  const [agreedPrice, setAgreedPrice] = useState(
    conv.agreed_price != null ? String(conv.agreed_price) : ''
  );
  const [saving, setSaving] = useState(false);
  const { success: showSuccess, error: showError } = useToast();

  const save = async () => {
    setSaving(true);
    const priceNum = agreedPrice.trim() ? parseFloat(agreedPrice) : null;
    const { error } = await supabase
      .from('conversations')
      .update({
        customer_name: name.trim() || null,
        customer_email: email.trim() || null,
        customer_phone: phone.trim() || null,
        agreed_price: (priceNum != null && !isNaN(priceNum) && priceNum > 0) ? priceNum : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conv.id);
    setSaving(false);
    if (error) {
      showError('Failed to save', error.message);
      return;
    }
    showSuccess('Customer info saved');
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Edit Customer Info</h3>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-200">
            💡 Ask the customer their name, email, and phone in the chat — then save
            here. This improves Meta CAPI ad attribution and lets you find them faster.
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold">
              Customer Name
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g., John Smith"
                className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-orange/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold">
              Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="customer@email.com"
                className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-orange/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold">
              Phone
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+1 555 123 4567"
                className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-orange/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold">
              Agreed Price (optional)
            </label>
            <div className="relative">
              <DollarSign className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="number"
                step="0.01"
                min="0"
                value={agreedPrice}
                onChange={e => setAgreedPrice(e.target.value)}
                placeholder="200.00"
                className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-orange/50"
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Save the price you quoted in chat — it'll auto-fill when you click "To Order".
            </p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-white/10 rounded-lg transition-all"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 bg-brand-orange hover:bg-brand-orange/90 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-all"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Convert to Order Modal ──────────────────────────────────────────────────
// Lets agents skip the Quote step when customer has already verbally agreed
// to a price in chat. Preserves the full attribution chain (fbc → order) so
// CAPI Purchase fires with 🟢 Tracked quality.

const ConvertToOrderModal: React.FC<{
  conv: Conversation;
  agentEmail: string | null;
  agentUserId: string | null;
  onClose: () => void;
  onCreated: (orderNumber: string) => void;
}> = ({ conv, agentEmail, agentUserId, onClose, onCreated }) => {
  const [designName, setDesignName] = useState('');
  const [patchType, setPatchType] = useState('Embroidered');
  const [quantity, setQuantity] = useState('');
  const [designSize, setDesignSize] = useState('');
  const [designBacking, setDesignBacking] = useState('Iron-on');
  const [orderAmount, setOrderAmount] = useState(
    conv.agreed_price != null ? String(conv.agreed_price) : ''
  );
  const [instructions, setInstructions] = useState('');
  const [creating, setCreating] = useState(false);
  const { success: showSuccess, error: showError } = useToast();

  // Warn if conversation is missing customer info — order is created from it
  const missingInfo = !conv.customer_email && !conv.customer_phone;

  const create = async () => {
    if (!conv.customer_name) {
      showError('Customer name required', 'Click the pencil icon in the header to add the customer name first.');
      return;
    }
    if (!conv.customer_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(conv.customer_email)) {
      showError('Customer email required', 'Add a valid customer email first — the order confirmation email won\'t send without it.');
      return;
    }
    const amountNum = parseFloat(orderAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      showError('Valid amount required', 'Enter the agreed-upon order total.');
      return;
    }
    const qtyNum = parseInt(quantity, 10);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      showError('Valid quantity required', 'How many patches?');
      return;
    }

    setCreating(true);
    try {
      const { createOrder } = await import('../services/orderService');
      const order = await createOrder({
        customerName:        conv.customer_name,
        customerEmail:       conv.customer_email || '',
        customerPhone:       conv.customer_phone || '',
        designName:          designName.trim(),
        patchesType:         patchType,
        patchesQuantity:     qtyNum,
        designSize:          designSize.trim(),
        designBacking,
        instructions:        instructions.trim(),
        orderAmount:         amountNum,
        amountPaid:          0,
        productionCost:      0,
        shippingCost:        0,
        marketingCost:       0,
        salesAgent:          agentEmail ?? 'unassigned',
        leadSource:          conv.channel === 'instagram' ? 'meta_instagram' : 'meta_messenger',
        attribution:         conv.attribution ?? null,
        isUrgent:            false,
        status:              'NEW_ORDER',
        mockupUrls:          [],
        customerAttachmentUrls: [],
        productionFileUrls:  [],
        shippingAttachmentUrls: [],
        redoAttachments:     [],
      }, agentEmail ?? 'system@pandapatches.com');

      // Stamp conversation as promoted to order
      await supabase
        .from('conversations')
        .update({
          promoted_to_order_id:         order.id,
          promoted_to_order_at:         new Date().toISOString(),
          promoted_to_order_by_user_id: agentUserId,
          updated_at:                   new Date().toISOString(),
        })
        .eq('id', conv.id);

      showSuccess(`Order ${order.orderNumber} created`);
      onCreated(order.orderNumber);
      onClose();
    } catch (err: any) {
      showError('Failed to create order', err?.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between sticky top-0 bg-slate-900 z-10">
          <div>
            <h3 className="text-base font-semibold text-white">Convert Chat to Order</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Skip the quote step — customer already agreed to a price
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Customer info preview — read-only, edited via pencil in conversation header */}
          <div className="bg-slate-800/50 rounded-lg p-3 border border-white/5">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Customer (from conversation)</p>
            <p className="text-sm font-medium text-white">{conv.customer_name || <em className="text-amber-400">No name — add via pencil ⚠️</em>}</p>
            {conv.customer_email && <p className="text-xs text-slate-400 mt-0.5">{conv.customer_email}</p>}
            {conv.customer_phone && <p className="text-xs text-slate-400">{conv.customer_phone}</p>}
            {conv.agreed_price != null && (
              <p className="text-xs text-emerald-400 mt-1 font-medium">💰 Agreed Price: ${Number(conv.agreed_price).toFixed(2)} (pre-filled below)</p>
            )}
            {missingInfo && (
              <p className="text-[10px] text-amber-400 mt-2">
                ⚠️ Missing email + phone. Email/phone help with Meta attribution quality. Add via the pencil icon in the conversation header before converting.
              </p>
            )}
          </div>

          {/* Order details */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold">Design Name</label>
              <input
                type="text"
                value={designName}
                onChange={e => setDesignName(e.target.value)}
                placeholder="e.g., Company Logo"
                className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-orange/50"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold">Patch Type</label>
              <select
                value={patchType}
                onChange={e => setPatchType(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-brand-orange/50"
              >
                {['Embroidered', 'PVC', 'Woven', 'Chenille', 'Leather', '3D Embroidery Puff', 'Sublimation Patch', 'DTF Transfer'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold">Quantity *</label>
              <input
                type="number"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                placeholder="100"
                min="1"
                className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-orange/50"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold">Size</label>
              <input
                type="text"
                value={designSize}
                onChange={e => setDesignSize(e.target.value)}
                placeholder='e.g., 3"'
                className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-orange/50"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold">Backing</label>
              <select
                value={designBacking}
                onChange={e => setDesignBacking(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-brand-orange/50"
              >
                {['Iron-on', 'Velcro', 'Adhesive', 'None'].map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold">Order Total ($) *</label>
              <input
                type="number"
                step="0.01"
                value={orderAmount}
                onChange={e => setOrderAmount(e.target.value)}
                placeholder="200.00"
                min="0.01"
                className="w-full px-3 py-2 bg-slate-800 border border-brand-orange/30 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-orange/60"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold">Instructions (optional)</label>
              <textarea
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
                placeholder="Any special notes from the customer…"
                rows={2}
                className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-orange/50 resize-none"
              />
            </div>
          </div>

          {/* Attribution preserved indicator */}
          {conv.attribution && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-xs text-emerald-300">
              ✅ Meta ad attribution will be preserved — CAPI Purchase will fire with full tracking when paid.
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-2 sticky bottom-0 bg-slate-900">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-white/10 rounded-lg transition-all"
          >
            Cancel
          </button>
          <button
            onClick={create}
            disabled={creating}
            className="px-4 py-2 bg-brand-orange hover:bg-brand-orange/90 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-all"
          >
            {creating ? 'Creating…' : 'Create Order'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const InboxPage: React.FC = () => {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const { conversationId } = useParams<{ conversationId: string }>();
  const queryClient = useQueryClient();
  const { success: showSuccess, error: showError } = useToast();

  // Production users have no business in customer inbox — redirect to orders
  useEffect(() => {
    if (role === 'PRODUCTION') navigate('/orders', { replace: true });
  }, [role, navigate]);

  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [selectedId, setSelectedId] = useState<number | null>(
    conversationId ? parseInt(conversationId, 10) : null
  );
  const [composerMode, setComposerMode] = useState<ComposerMode>('reply');
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [convertingDirectlyToOrder, setConvertingDirectlyToOrder] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input — 300ms so we don't query on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);
  const [replyText, setReplyText] = useState('');
  const [selectedTag, setSelectedTag] = useState<MessageTag>('POST_PURCHASE_UPDATE');
  const lastSendAtRef = useRef<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [convertingToQuote, setConvertingToQuote] = useState(false);

  // ── Fetch conversations ──────────────────────────────────────
  const { data: conversations = [], isLoading: convsLoading, refetch: refetchConvs } = useQuery({
    queryKey: ['inbox-conversations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .order('last_message_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data || []) as Conversation[];
    },
    refetchInterval: 15000,
  });

  // ── Fetch agents ─────────────────────────────────────────────
  const { data: agents = [] } = useQuery({
    queryKey: ['inbox-agents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, email, full_name')
        .in('role', ['ADMIN', 'SALES_AGENT'])
        .order('full_name');
      if (error) throw error;
      return (data || []) as UserProfile[];
    },
    staleTime: 60_000,
  });

  // ── Message text search ─────────────────────────────────────
  // When user types in search box, find conversation IDs whose messages match.
  // We sanitize input to prevent PostgREST filter injection.
  const { data: matchingConvIds = [] } = useQuery({
    queryKey: ['inbox-search-message-conv-ids', debouncedSearch],
    queryFn: async (): Promise<number[]> => {
      if (!debouncedSearch || debouncedSearch.length < 2) return [];
      const safe = sanitizeIlikePattern(debouncedSearch);
      if (!safe) return [];
      const { data, error } = await supabase
        .from('meta_messages')
        .select('conversation_id')
        .ilike('text', `%${safe}%`)
        .limit(500);
      if (error) return [];
      const ids = new Set<number>();
      (data || []).forEach((m: any) => { if (m.conversation_id) ids.add(m.conversation_id); });
      return Array.from(ids);
    },
    enabled: debouncedSearch.length >= 2,
    staleTime: 10_000,
  });

  // ── Filter ───────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    const idSet = new Set(matchingConvIds);
    return conversations.filter(c => {
      // Tab filters
      if (activeFilter === 'closed') {
        if (c.status !== 'closed') return false;
      } else {
        if (c.status === 'closed') return false;
        if (activeFilter === 'mine' && c.assignee_user_id !== user?.id) return false;
        if (activeFilter === 'unassigned' && c.assignee_user_id) return false;
      }
      // Search filter — match name, email, phone, last message preview, OR message body
      if (q.length >= 2) {
        const matchesMeta =
          (c.customer_name?.toLowerCase().includes(q) ?? false) ||
          (c.customer_email?.toLowerCase().includes(q) ?? false) ||
          (c.customer_phone?.toLowerCase().includes(q) ?? false) ||
          (c.last_message_preview?.toLowerCase().includes(q) ?? false);
        const matchesMessage = idSet.has(c.id);
        if (!matchesMeta && !matchesMessage) return false;
      }
      return true;
    });
  }, [conversations, activeFilter, user?.id, debouncedSearch, matchingConvIds]);

  const selectedConv = conversations.find(c => c.id === selectedId) ?? null;

  // ── Fetch messages ───────────────────────────────────────────
  const { data: messages = [], isLoading: msgsLoading } = useQuery({
    queryKey: ['inbox-messages', selectedId],
    queryFn: async () => {
      if (!selectedId) return [];
      const { data, error } = await supabase
        .from('meta_messages')
        .select('*')
        .eq('conversation_id', selectedId)
        .order('received_at', { ascending: true });
      if (error) throw error;
      return (data || []) as MetaMessage[];
    },
    enabled: !!selectedId,
    refetchInterval: 10000,
  });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, selectedId]);

  // Clear unread badge when conversation is opened
  useEffect(() => {
    if (!selectedId) return;
    const conv = conversations.find(c => c.id === selectedId);
    if (conv && conv.unread_count > 0) {
      supabase
        .from('conversations')
        .update({ unread_count: 0 })
        .eq('id', selectedId)
        .then(() => queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] }));
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset composer when switching conversations
  useEffect(() => {
    setReplyText('');
    setComposerMode('reply');
  }, [selectedId]);

  // ── 24h window ───────────────────────────────────────────────
  const lastInboundMs = useMemo(() => {
    const last = [...messages].reverse().find(m => m.direction === 'inbound' && !m.is_internal_note);
    return last ? new Date(last.received_at).getTime() : 0;
  }, [messages]);
  const hoursSince = lastInboundMs > 0 ? (Date.now() - lastInboundMs) / 3_600_000 : Infinity;
  const insideWindow = hoursSince < 24;

  // ── Send reply (via Meta) ────────────────────────────────────
  const sendReply = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error('No conversation selected');
      const text = replyText.trim();
      if (!text) throw new Error('Message is empty');

      const since = Date.now() - lastSendAtRef.current;
      if (since < 250) await new Promise(r => setTimeout(r, 250 - since));
      lastSendAtRef.current = Date.now();

      const body: any = { conversation_id: selectedId, text };
      if (!insideWindow) body.tag = selectedTag;

      const { data, error } = await supabase.functions.invoke('send-meta-message', { body });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Failed to send');
      return data;
    },
    onSuccess: (data) => {
      setReplyText('');
      showSuccess('Message sent');
      queryClient.invalidateQueries({ queryKey: ['inbox-messages', selectedId] });
      queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] });
      if (data?.auto_claimed) showSuccess('You have been assigned this conversation');
    },
    onError: (err: any) => showError('Send failed', err?.message || 'Try again'),
  });

  // ── Save internal note ───────────────────────────────────────
  const saveNote = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error('No conversation selected');
      const text = replyText.trim();
      if (!text) throw new Error('Note is empty');

      const { error } = await supabase.from('meta_messages').insert({
        conversation_id: selectedId,
        direction: 'outbound',
        channel: selectedConv?.channel ?? 'messenger',
        text,
        received_at: new Date().toISOString(),
        sender_user_id: user?.id ?? null,
        sender_email: user?.email ?? null,
        is_internal_note: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setReplyText('');
      showSuccess('Note saved');
      queryClient.invalidateQueries({ queryKey: ['inbox-messages', selectedId] });
    },
    onError: (err: any) => showError('Failed to save note', err?.message),
  });

  // ── Convert conversation to Quote ─────────────────────────────
  const convertToQuote = async () => {
    if (!selectedConv) return;
    if (selectedConv.promoted_quote_id) {
      // Already converted — navigate there
      const { data } = await supabase
        .from('quotes')
        .select('quote_number')
        .eq('id', selectedConv.promoted_quote_id)
        .single();
      if (data?.quote_number) navigate(`/quote/${data.quote_number}`);
      return;
    }

    setConvertingToQuote(true);
    try {
      // Insert a new quote pre-filled from the conversation
      // Pull customer_email/phone from conversation if agent filled them in
      // (otherwise quote starts blank and agent fills them on the quote page).
      const { data: newQuote, error: qErr } = await supabase
        .from('quotes')
        .insert({
          customer_name: selectedConv.customer_name || 'Unknown',
          customer_email: selectedConv.customer_email || null,
          customer_phone: selectedConv.customer_phone || null,
          sales_agent: 'unassigned',
          lead_source: selectedConv.channel === 'instagram' ? 'meta_instagram' : 'meta_messenger',
          attribution: selectedConv.attribution,
        })
        .select('id, quote_number')
        .single();

      if (qErr || !newQuote) throw qErr ?? new Error('Insert failed');

      // Stamp conversation as promoted
      await supabase
        .from('conversations')
        .update({
          promoted_quote_id: newQuote.id,
          promoted_at: new Date().toISOString(),
          promoted_by_user_id: user?.id ?? null,
        })
        .eq('id', selectedConv.id);

      queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] });
      showSuccess('Quote created — opening…');
      navigate(`/quote/${newQuote.quote_number}`);
    } catch (err: any) {
      showError('Failed to create quote', err?.message);
    } finally {
      setConvertingToQuote(false);
    }
  };

  // ── Close / reopen ───────────────────────────────────────────
  const toggleStatus = async () => {
    if (!selectedConv) return;
    const newStatus = selectedConv.status === 'open' ? 'closed' : 'open';
    const { error } = await supabase
      .from('conversations')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', selectedConv.id);
    if (error) showError('Failed to update status', error.message);
    else {
      queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] });
      if (newStatus === 'closed' && activeFilter !== 'closed') setSelectedId(null);
    }
  };

  const filterTabs: { id: FilterTab; label: string }[] = [
    { id: 'all',        label: 'All' },
    { id: 'mine',       label: 'Mine' },
    { id: 'unassigned', label: 'Unassigned' },
    { id: 'closed',     label: 'Closed' },
  ];

  const agentMap = useMemo(() => Object.fromEntries(agents.map(a => [a.id, a])), [agents]);

  const isPending = composerMode === 'reply' ? sendReply.isPending : saveNote.isPending;
  const handleSend = () => composerMode === 'reply' ? sendReply.mutate() : saveNote.mutate();

  const businessSuiteUrl = selectedConv?.channel === 'instagram'
    ? 'https://business.facebook.com/latest/inbox/instagram'
    : 'https://business.facebook.com/latest/inbox/messenger';

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-[#0B1120] overflow-hidden">

      {/* ── Left panel: conversation list ───────────────────────── */}
      <div className="w-80 shrink-0 flex flex-col border-r border-white/5">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Inbox</h2>
          <button
            onClick={() => refetchConvs()}
            className="p-1.5 rounded-lg hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-all"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Search bar — searches across customer name, email, phone, AND message body */}
        <div className="px-4 py-2 border-b border-white/5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, email, or message…"
              className="w-full pl-8 pr-8 py-1.5 bg-slate-800/60 border border-white/10 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-orange/50 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-500 hover:text-slate-300 rounded"
                title="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex border-b border-white/5">
          {filterTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveFilter(tab.id); setSelectedId(null); }}
              className={`flex-1 py-2 text-xs font-medium transition-all ${
                activeFilter === tab.id
                  ? 'text-brand-orange border-b-2 border-brand-orange'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {tab.label}
              {tab.id === 'all' && conversations.filter(c => c.status === 'open').length > 0 && (
                <span className="ml-1 text-[10px] text-slate-600">
                  {conversations.filter(c => c.status === 'open').length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {convsLoading ? (
            <div className="p-6 text-center text-sm text-slate-500">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center">
              <MessageSquare className="w-8 h-8 text-slate-700 mx-auto mb-2 opacity-50" />
              <p className="text-sm text-slate-500">No conversations</p>
            </div>
          ) : (
            filtered.map(conv => (
              <ConvItem
                key={conv.id}
                conv={conv}
                selected={selectedId === conv.id}
                assigneeName={conv.assignee_user_id ? agentMap[conv.assignee_user_id]?.email?.split('@')[0] : undefined}
                onClick={() => setSelectedId(conv.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right panel: thread ──────────────────────────────────── */}
      {!selectedConv ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
          <MessageSquare className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm">Select a conversation</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Thread header */}
          <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`p-1.5 rounded-lg shrink-0 ${
                selectedConv.channel === 'instagram'
                  ? 'bg-gradient-to-br from-pink-500/20 to-purple-500/20'
                  : 'bg-blue-500/15'
              }`}>
                {selectedConv.channel === 'instagram'
                  ? <Instagram className="w-4 h-4 text-pink-400" />
                  : <MessageSquare className="w-4 h-4 text-blue-400" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className={`text-sm font-semibold truncate ${
                    !selectedConv.customer_name || selectedConv.customer_name === 'Meta messenger user'
                      ? 'text-slate-400 italic'
                      : 'text-white'
                  }`}>
                    {selectedConv.customer_name || 'Unknown'}
                  </p>
                  <button
                    onClick={() => setEditingCustomer(true)}
                    className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-brand-orange transition-all shrink-0"
                    title="Edit customer info (name, email, phone)"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-xs text-slate-500 capitalize">
                  {selectedConv.channel}
                  {selectedConv.customer_email && <> · {selectedConv.customer_email}</>}
                  {selectedConv.customer_phone && <> · {selectedConv.customer_phone}</>}
                </p>
              </div>
              {selectedConv.meta_ad_id && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-brand-orange/15 text-brand-orange shrink-0">
                  <Megaphone className="w-2.5 h-2.5" />
                  Ad
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Convert to Quote — for customers who want a formal price email first */}
              <button
                onClick={convertToQuote}
                disabled={convertingToQuote}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  selectedConv.promoted_quote_id
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10'
                }`}
                title={selectedConv.promoted_quote_id ? 'Open linked quote' : 'Convert to Quote'}
              >
                <FileText className="w-3 h-3" />
                {selectedConv.promoted_quote_id ? 'View Quote' : (convertingToQuote ? 'Creating…' : 'To Quote')}
              </button>

              {/* Convert directly to Order — for customers who already agreed to price in chat */}
              <button
                onClick={async () => {
                  if (selectedConv.promoted_to_order_id) {
                    // Already converted — open the order
                    const { data } = await supabase
                      .from('orders')
                      .select('order_number')
                      .eq('id', selectedConv.promoted_to_order_id)
                      .single();
                    if (data?.order_number) navigate(`/order/${data.order_number}`);
                    return;
                  }
                  setConvertingDirectlyToOrder(true);
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  selectedConv.promoted_to_order_id
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
                    : 'bg-brand-orange/15 hover:bg-brand-orange/25 text-brand-orange border border-brand-orange/30'
                }`}
                title={selectedConv.promoted_to_order_id ? 'Open linked order' : 'Convert directly to Order (skip quote)'}
              >
                <Package className="w-3 h-3" />
                {selectedConv.promoted_to_order_id ? 'View Order' : 'To Order'}
              </button>

              <a
                href={businessSuiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-all"
                title="Open in Business Suite"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <AssigneeDropdown
                convId={selectedConv.id}
                currentAssigneeId={selectedConv.assignee_user_id}
                agents={agents}
                onAssigned={() => queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] })}
              />

              <button
                onClick={toggleStatus}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  selectedConv.status === 'open'
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10'
                    : 'bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30'
                }`}
              >
                {selectedConv.status === 'open' ? <X className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                {selectedConv.status === 'open' ? 'Close' : 'Reopen'}
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {msgsLoading ? (
              <div className="text-center py-8 text-sm text-slate-500">Loading messages…</div>
            ) : messages.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="w-8 h-8 text-slate-700 mx-auto mb-2 opacity-50" />
                <p className="text-sm text-slate-400">No messages yet</p>
              </div>
            ) : (
              messages.map(msg => (
                <MessageBubble key={msg.id} message={msg} customerName={selectedConv.customer_name} />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Composer */}
          {selectedConv.status === 'open' && (
            <div className="border-t border-white/5 bg-slate-900/40 shrink-0">

              {/* Mode tabs: Reply | Note */}
              <div className="flex border-b border-white/5">
                <button
                  onClick={() => setComposerMode('reply')}
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-all ${
                    composerMode === 'reply'
                      ? 'text-white border-b-2 border-brand-orange'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Send className="w-3 h-3" />
                  Reply
                </button>
                <button
                  onClick={() => setComposerMode('note')}
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-all ${
                    composerMode === 'note'
                      ? 'text-amber-400 border-b-2 border-amber-400'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Lock className="w-3 h-3" />
                  Internal Note
                </button>
              </div>

              {/* 24h window warning — only in reply mode */}
              {composerMode === 'reply' && !insideWindow && (
                <div className="px-5 py-3 bg-amber-500/5 border-b border-amber-500/20">
                  <div className="flex items-start gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <div className="text-xs text-amber-200">
                      <p className="font-medium mb-0.5">Outside 24h window</p>
                      <p className="text-amber-200/70">
                        {lastInboundMs === 0
                          ? 'No inbound messages yet — pick a tag.'
                          : `Last reply was ${Math.round(hoursSince)}h ago. Pick a message tag.`}
                      </p>
                    </div>
                  </div>
                  <select
                    value={selectedTag}
                    onChange={e => setSelectedTag(e.target.value as MessageTag)}
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
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      if (replyText.trim() && !isPending) handleSend();
                    }
                  }}
                  placeholder={
                    composerMode === 'note'
                      ? 'Add an internal note (only visible to your team)…'
                      : insideWindow
                        ? `Reply to ${selectedConv.customer_name || 'customer'}…  (Cmd+Enter to send)`
                        : 'Send tagged message…  (Cmd+Enter to send)'
                  }
                  rows={2}
                  maxLength={2000}
                  className={`w-full px-3 py-2 bg-slate-800 border rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none resize-none ${
                    composerMode === 'note'
                      ? 'border-amber-500/30 focus:border-amber-500/60'
                      : 'border-white/10 focus:border-brand-orange/50'
                  }`}
                />
                <div className="flex items-center justify-between mt-2">
                  <p className="text-[10px] text-slate-500">
                    {replyText.length}/2000
                    {composerMode === 'reply' && ` · via Meta ${selectedConv.channel}`}
                    {composerMode === 'note' && ' · internal only'}
                  </p>
                  <button
                    onClick={handleSend}
                    disabled={!replyText.trim() || isPending}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed text-white ${
                      composerMode === 'note'
                        ? 'bg-amber-500 hover:bg-amber-400'
                        : 'bg-brand-orange hover:bg-brand-orange/90'
                    }`}
                  >
                    {composerMode === 'note' ? <Lock className="w-3 h-3" /> : <Send className="w-3 h-3" />}
                    {isPending
                      ? (composerMode === 'note' ? 'Saving…' : 'Sending…')
                      : (composerMode === 'note' ? 'Save Note' : 'Send')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {selectedConv.status === 'closed' && (
            <div className="p-4 border-t border-white/5 text-center">
              <p className="text-xs text-slate-500 mb-2">This conversation is closed.</p>
              <button
                onClick={toggleStatus}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 rounded-lg text-xs font-medium transition-all"
              >
                <Check className="w-3 h-3" />
                Reopen
              </button>
            </div>
          )}
        </div>
      )}

      {/* Customer info edit modal */}
      {editingCustomer && selectedConv && (
        <CustomerInfoModal
          conv={selectedConv}
          onClose={() => setEditingCustomer(false)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] })}
        />
      )}

      {/* Direct chat-to-order modal */}
      {convertingDirectlyToOrder && selectedConv && (
        <ConvertToOrderModal
          conv={selectedConv}
          agentEmail={user?.email ?? null}
          agentUserId={user?.id ?? null}
          onClose={() => setConvertingDirectlyToOrder(false)}
          onCreated={(orderNumber) => {
            queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] });
            navigate(`/order/${orderNumber}`);
          }}
        />
      )}
    </div>
  );
};

export default InboxPage;
