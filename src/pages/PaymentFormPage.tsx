// src/pages/PaymentFormPage.tsx
// Simplified flow: agent enters amount + customer details → generates Square payment link
// → customer pays exact amount → order created automatically.
// For deposits: agent generates a second link for the balance later from the same page.

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { uploadFile } from '../services/storageService';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import SpotlightCard from '../components/ui/SpotlightCard';
import {
  Link, Copy, Check, Plus, ExternalLink, Trash2,
  CreditCard, ChevronDown, ChevronUp, MessageCircle, Mail,
  ImagePlus, Loader2, X,
} from 'lucide-react';
import { format, parseISO, isPast } from 'date-fns';

const PATCH_TYPES = [
  'Embroidered Patches', 'Woven Patches', 'PVC Patches',
  'Leather Patches', 'Chenille Patches', 'Custom 3D Embroidered Transfers',
  'Heat Transfer', 'Screen Print', 'Sublimation Patch',
];

const BACKING_OPTIONS = ['Iron-on', 'Velcro', 'Sew-on', 'No Backing', 'Adhesive'];

interface Token {
  id: number;
  token: string;
  created_by: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  patches_type: string | null;
  patches_quantity: number | null;
  order_amount: number | null;
  is_deposit: boolean | null;
  expires_at: string;
  used_at: string | null;
  order_number: string | null;
  order_id: number | null;
  created_at: string;
}

const portalUrl = (token: string) =>
  `https://login.pandapatches.com/pay/${token}`;

const PaymentFormPage: React.FC = () => {
  const { user } = useAuth();
  const { success: showSuccess, error: showError } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);

  const [form, setForm] = useState({
    customer_name:    '',
    customer_email:   '',
    customer_phone:   '',
    patches_type:     '',
    patches_quantity: '',
    design_name:      '',
    design_size:      '',
    design_backing:   '',
    instructions:     '',
    order_amount:     '',
    is_deposit:       false,
  });

  // Design/mockup images the agent attaches at link creation → copied to the order on payment
  const [mockupUrls, setMockupUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ['payment-form-tokens'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_form_tokens')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as Token[];
    },
    staleTime: 30_000,
  });

  const createToken = useMutation({
    mutationFn: async () => {
      if (!form.order_amount || parseFloat(form.order_amount) <= 0) {
        throw new Error('Amount is required');
      }
      const payload: any = {
        created_by:   user?.email || 'unknown',
        order_amount: parseFloat(form.order_amount),
        is_deposit:   form.is_deposit, // agent flags this charge as a deposit (partial payment)
        allow_deposit: false,
        deposit_pct_options: null,
      };
      if (form.customer_name.trim())    payload.customer_name    = form.customer_name.trim();
      if (form.customer_email.trim())   payload.customer_email   = form.customer_email.trim();
      if (form.customer_phone.trim())   payload.customer_phone   = form.customer_phone.trim();
      if (form.patches_type)            payload.patches_type     = form.patches_type;
      if (form.patches_quantity)        payload.patches_quantity = parseInt(form.patches_quantity);
      if (form.design_name.trim())      payload.design_name      = form.design_name.trim();
      if (form.design_size.trim())      payload.design_size      = form.design_size.trim();
      if (form.design_backing)          payload.design_backing   = form.design_backing;
      if (form.instructions.trim())     payload.instructions     = form.instructions.trim();
      if (mockupUrls.length > 0)        payload.mockup_urls      = mockupUrls;

      const { data, error } = await supabase
        .from('payment_form_tokens')
        .insert([payload])
        .select('token')
        .single();
      if (error) throw error;
      return data.token as string;
    },
    onSuccess: (token) => {
      queryClient.invalidateQueries({ queryKey: ['payment-form-tokens'] });
      setGeneratedToken(token);
      navigator.clipboard.writeText(portalUrl(token)).catch(() => {});
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 3000);
    },
    onError: (err: any) => showError('Failed to create link', err?.message),
  });

  const deleteToken = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('payment_form_tokens').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payment-form-tokens'] }),
    onError: (err: any) => showError('Delete failed', err?.message),
  });

  const handleCopy = (token: string) => {
    navigator.clipboard.writeText(portalUrl(token));
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2500);
  };

  const handleWhatsApp = (token: string, t: Token) => {
    const name = t.customer_name?.split(' ')[0] || 'there';
    const amount = t.order_amount ? `$${Number(t.order_amount).toFixed(2)}` : '';
    const msg = `Hi ${name}! Here's your secure payment link${amount ? ` for ${amount}` : ''}:\n\n${portalUrl(token)}\n\nComplete your order details and pay securely via Square. Thanks! — Panda Patches`;
    const phone = t.customer_phone?.replace(/\D/g, '') || '';
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // allow re-selecting the same file
    if (files.length === 0) return;
    setUploading(true);
    try {
      const urls = await Promise.all(files.map(f => uploadFile(f)));
      setMockupUrls(prev => [...prev, ...urls]);
    } catch (err: any) {
      showError('Image upload failed', err?.message);
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (url: string) => setMockupUrls(prev => prev.filter(u => u !== url));

  const resetForm = () => {
    setForm({ customer_name: '', customer_email: '', customer_phone: '', patches_type: '', patches_quantity: '', design_name: '', design_size: '', design_backing: '', instructions: '', order_amount: '', is_deposit: false });
    setMockupUrls([]);
    setGeneratedToken(null);
    setShowForm(false);
  };

  const activeTokens = tokens.filter(t => !t.used_at && !isPast(parseISO(t.expires_at)));
  const usedTokens   = tokens.filter(t => t.used_at);
  const expiredTokens = tokens.filter(t => !t.used_at && isPast(parseISO(t.expires_at)));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-brand-orange" />
            Payment Form Links
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Set an amount → send link → customer fills details + pays → order auto-created in CRM.
          </p>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); setGeneratedToken(null); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-orange hover:bg-orange-500 text-white rounded-xl text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Payment Link
          {showForm ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <SpotlightCard className="p-6">
          {!generatedToken ? (
            <>
              <h3 className="text-base font-semibold text-white mb-1">New Payment Link</h3>
              <p className="text-xs text-slate-400 mb-5">
                Set the amount to charge. Customer fills in any blank fields on their end.
              </p>

              {/* Amount — primary field, prominent */}
              <div className="mb-5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Amount to Charge <span className="text-red-400">*</span>
                </label>
                <div className="relative max-w-xs">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg font-semibold">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.order_amount}
                    onChange={e => setForm(f => ({ ...f, order_amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full pl-8 pr-4 py-3 bg-slate-800 border border-brand-orange/40 focus:border-brand-orange text-white text-xl font-bold rounded-xl focus:outline-none transition-colors"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1.5">
                  This is exactly what the customer will pay — deposit, full, or any amount you agree on.
                </p>

                {/* Deposit toggle — marks the charge as a partial payment on the customer page */}
                <label className="flex items-start gap-2.5 mt-3 max-w-md cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.is_deposit}
                    onChange={e => setForm(f => ({ ...f, is_deposit: e.target.checked }))}
                    className="mt-0.5 w-4 h-4 rounded border-slate-600 bg-slate-800 text-brand-orange focus:ring-brand-orange focus:ring-offset-0"
                  />
                  <span className="text-xs text-slate-300">
                    This is a <span className="font-semibold text-brand-orange">deposit</span> (partial payment)
                    <span className="block text-slate-500 mt-0.5">
                      The customer's page will clearly show it's a deposit, not full payment. Collect the balance separately later.
                    </span>
                  </span>
                </label>
              </div>

              {/* Customer + Order details in a compact grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                <div className="space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Customer (optional)</p>
                  <FI label="Name" value={form.customer_name} onChange={v => setForm(f => ({ ...f, customer_name: v }))} placeholder="Aaron Leupp" />
                  <FI label="Email" value={form.customer_email} onChange={v => setForm(f => ({ ...f, customer_email: v }))} placeholder="aaron@example.com" type="email" />
                  <FI label="Phone" value={form.customer_phone} onChange={v => setForm(f => ({ ...f, customer_phone: v }))} placeholder="+1 623 238 6390" type="tel" />
                </div>
                <div className="space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Order (optional)</p>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Patch Type</label>
                    <select value={form.patches_type} onChange={e => setForm(f => ({ ...f, patches_type: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-brand-orange">
                      <option value="">— Customer selects —</option>
                      {PATCH_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <FI label="Qty" value={form.patches_quantity} onChange={v => setForm(f => ({ ...f, patches_quantity: v }))} placeholder="100" type="number" />
                    <FI label="Size" value={form.design_size} onChange={v => setForm(f => ({ ...f, design_size: v }))} placeholder='3"x3"' />
                  </div>
                  <FI label="Design Name" value={form.design_name} onChange={v => setForm(f => ({ ...f, design_name: v }))} placeholder="Company Logo" />
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Backing</label>
                    <select value={form.design_backing} onChange={e => setForm(f => ({ ...f, design_backing: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-brand-orange">
                      <option value="">— Customer selects —</option>
                      {BACKING_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="mt-3">
                <label className="block text-xs text-slate-400 mb-1">Instructions (optional)</label>
                <textarea value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
                  placeholder="Any notes for the customer or production…" rows={2}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 placeholder-slate-600 focus:outline-none focus:border-brand-orange resize-none" />
              </div>

              {/* Design / mockup images (optional) — attached to the order on payment */}
              <div className="mt-3">
                <label className="block text-xs text-slate-400 mb-1">Design / Reference Images (optional)</label>
                <div className="flex flex-wrap items-center gap-3">
                  {mockupUrls.map(url => (
                    <div key={url} className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-700 group">
                      <img src={url} alt="Design reference" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(url)}
                        className="absolute top-1 right-1 p-0.5 bg-black/70 hover:bg-red-600 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove image"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <label className={`w-20 h-20 flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-600 text-slate-400 hover:border-brand-orange hover:text-brand-orange cursor-pointer transition-colors ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
                    {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
                    <span className="text-[10px]">{uploading ? 'Uploading…' : 'Add image'}</span>
                    <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" disabled={uploading} />
                  </label>
                </div>
                <p className="text-[10px] text-slate-500 mt-1.5">
                  Attach the customer's design so production has the reference image when the order is created.
                </p>
              </div>

              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => createToken.mutate()}
                  disabled={createToken.isPending || uploading || !form.order_amount || parseFloat(form.order_amount) <= 0}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-brand-orange hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-colors"
                >
                  <Link className="w-4 h-4" />
                  {createToken.isPending ? 'Generating…' : `Generate $${parseFloat(form.order_amount || '0').toFixed(2)} Payment Link`}
                </button>
                <button onClick={resetForm} className="px-4 py-3 border border-white/10 text-slate-400 hover:text-white rounded-xl text-sm transition-colors">
                  Cancel
                </button>
              </div>
            </>
          ) : (
            /* Success state — show link + send options */
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center shrink-0">
                  <Check className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-base font-semibold text-white">Payment link created!</p>
                  <p className="text-xs text-slate-400">Send it to your customer via WhatsApp or copy it.</p>
                </div>
              </div>

              <div className="bg-slate-800/60 rounded-xl p-3 border border-white/10">
                <p className="text-xs text-slate-500 mb-1">Payment link</p>
                <p className="text-sm text-brand-orange font-mono break-all">{portalUrl(generatedToken)}</p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <button onClick={() => handleCopy(generatedToken)}
                  className="flex flex-col items-center gap-1.5 py-3 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded-xl transition-all">
                  {copiedToken === generatedToken
                    ? <><Check className="w-5 h-5 text-emerald-400" /><span className="text-xs text-emerald-400">Copied!</span></>
                    : <><Copy className="w-5 h-5 text-slate-300" /><span className="text-xs text-slate-300">Copy Link</span></>}
                </button>

                <button
                  onClick={() => {
                    const t = tokens.find(t => t.token === generatedToken);
                    if (t) handleWhatsApp(generatedToken, t);
                  }}
                  className="flex flex-col items-center gap-1.5 py-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-xl transition-all"
                >
                  <MessageCircle className="w-5 h-5 text-emerald-400" />
                  <span className="text-xs text-emerald-400">WhatsApp</span>
                </button>

                <a href={portalUrl(generatedToken)} target="_blank" rel="noopener noreferrer"
                  className="flex flex-col items-center gap-1.5 py-3 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded-xl transition-all">
                  <ExternalLink className="w-5 h-5 text-slate-300" />
                  <span className="text-xs text-slate-300">Preview</span>
                </a>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setGeneratedToken(null); setForm(f => ({ ...f, order_amount: '' })); }}
                  className="flex-1 py-2.5 border border-white/10 text-slate-400 hover:text-white rounded-xl text-sm transition-colors"
                >
                  Create Another Link
                </button>
                <button onClick={resetForm} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-medium transition-colors">
                  Done
                </button>
              </div>
            </div>
          )}
        </SpotlightCard>
      )}

      {/* Active Links */}
      {activeTokens.length > 0 && (
        <SpotlightCard className="p-6">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
            Active Links ({activeTokens.length})
          </h3>
          <div className="space-y-2">
            {activeTokens.map(t => <TokenRow key={t.id} t={t} onCopy={handleCopy} onWhatsApp={handleWhatsApp} onDelete={id => deleteToken.mutate(id)} copiedToken={copiedToken} />)}
          </div>
        </SpotlightCard>
      )}

      {/* Paid Links */}
      {usedTokens.length > 0 && (
        <SpotlightCard className="p-6">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
            Paid ({usedTokens.length})
          </h3>
          <div className="space-y-2">
            {usedTokens.map(t => <TokenRow key={t.id} t={t} onCopy={handleCopy} onWhatsApp={handleWhatsApp} onDelete={id => deleteToken.mutate(id)} copiedToken={copiedToken} />)}
          </div>
        </SpotlightCard>
      )}

      {/* Empty state */}
      {!isLoading && tokens.length === 0 && !showForm && (
        <SpotlightCard className="p-12 text-center">
          <Link className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-400 text-sm mb-1">No payment links yet.</p>
          <p className="text-slate-600 text-xs">Click "New Payment Link" to generate one and send it to a customer.</p>
        </SpotlightCard>
      )}
    </div>
  );
};

const TokenRow: React.FC<{
  t: Token;
  onCopy: (token: string) => void;
  onWhatsApp: (token: string, t: Token) => void;
  onDelete: (id: number) => void;
  copiedToken: string | null;
}> = ({ t, onCopy, onWhatsApp, onDelete, copiedToken }) => {
  const used    = !!t.used_at;
  const expired = !used && isPast(parseISO(t.expires_at));
  const copied  = copiedToken === t.token;

  return (
    <div className={`flex flex-wrap items-center gap-3 p-3.5 rounded-xl border transition-colors ${
      used    ? 'border-emerald-500/20 bg-emerald-500/5'
      : expired ? 'border-slate-700/50 bg-slate-800/20 opacity-50'
      : 'border-white/10 bg-slate-800/30 hover:bg-slate-800/50'
    }`}>
      {/* Amount badge */}
      <div className="w-16 text-center shrink-0">
        <p className="text-base font-bold text-brand-orange">
          {t.order_amount ? `$${Number(t.order_amount).toFixed(0)}` : '—'}
        </p>
        {t.is_deposit && (
          <span className="inline-block mt-0.5 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded bg-amber-500/20 text-amber-300">
            Deposit
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">
          {t.customer_name || <span className="text-slate-500 italic text-xs">Name not set</span>}
          {t.patches_type && <span className="text-slate-400 text-xs ml-2">· {t.patches_type}</span>}
          {t.patches_quantity && <span className="text-slate-400 text-xs"> × {t.patches_quantity}</span>}
        </p>
        <p className="text-xs text-slate-500 truncate mt-0.5">
          {t.customer_email || 'No email'}
          {' · '}
          {used
            ? `Paid ${format(parseISO(t.used_at!), 'MMM d')} → `
            : expired ? 'Expired · '
            : `Expires ${format(parseISO(t.expires_at), 'MMM d')} · `}
          {used && t.order_number
            ? <a href={`/order/${t.order_number}`} className="text-emerald-400 hover:underline">{t.order_number}</a>
            : used ? 'Order created' : ''}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {!used && !expired && (
          <>
            <button onClick={() => onCopy(t.token)}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-xs text-white rounded-lg transition-colors">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
            {t.customer_phone && (
              <button onClick={() => onWhatsApp(t.token, t)}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-xs text-emerald-300 rounded-lg transition-colors border border-emerald-500/20">
                <MessageCircle className="w-3.5 h-3.5" />
                WA
              </button>
            )}
          </>
        )}
        {used && t.order_number && (
          <a href={`/order/${t.order_number}`}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-xs text-emerald-300 rounded-lg transition-colors border border-emerald-500/20">
            <ExternalLink className="w-3.5 h-3.5" /> Order
          </a>
        )}
        <button onClick={() => onDelete(t.id)} className="p-1.5 text-slate-600 hover:text-red-400 transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

const FI: React.FC<{ label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }> = ({ label, value, onChange, placeholder, type = 'text' }) => (
  <div>
    <label className="block text-xs text-slate-400 mb-1">{label}</label>
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 placeholder-slate-600 focus:outline-none focus:border-brand-orange transition-colors" />
  </div>
);

export default PaymentFormPage;
