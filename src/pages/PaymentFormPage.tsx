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
import { PATCHES_TYPE_OPTIONS, DESIGN_BACKING_OPTIONS, COUNTRY_OPTIONS } from '../constants/index';
import { copyToClipboard } from '../utils/copyToClipboard';
import {
  Link, Copy, Check, Plus, ExternalLink, Trash2,
  CreditCard, ChevronDown, ChevronUp, MessageCircle, Mail,
  ImagePlus, Loader2, X,
} from 'lucide-react';
import { format, parseISO, isPast } from 'date-fns';

// Single source of truth — patch types + backing come from src/constants/options.ts,
// shared with the CRM order form, quotes, and the customer payment page.
const PATCH_TYPES = PATCHES_TYPE_OPTIONS;
const BACKING_OPTIONS = DESIGN_BACKING_OPTIONS;
// Not a shared constant — mirrors the hardcoded list in OrderForm.tsx.
const BORDER_TYPE_OPTIONS = ['Merrow Border', 'Embroidery Border', 'Laser Cut', 'No Border'];

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
  deposit_amount: number | null;
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
    cc_email:         '',
    shipping_address: '',
    patches_type:     '',
    patches_quantity: '',
    design_name:      '',
    design_size:      '',
    design_backing:   '',
    border_type:      '',
    sample_box:       false,
    country:          '',
    purchase_order:   '',
    organization:     '',
    instructions:     '',
    order_amount:     '',
    deposit_amount:   '',
    is_deposit:       false,
    is_urgent:        false,
    rush_date:        '',
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
      const total = parseFloat(form.order_amount);
      if (!form.order_amount || total <= 0) {
        throw new Error('Order total is required');
      }
      // Deposit: charge only part now; order_amount stays the full total so the created
      // order shows Total / Paid / Remaining correctly (no manual fix — see PP-11132).
      let depositAmount: number | null = null;
      if (form.is_deposit) {
        depositAmount = parseFloat(form.deposit_amount);
        if (!form.deposit_amount || isNaN(depositAmount) || depositAmount <= 0) {
          throw new Error('Deposit amount is required');
        }
        if (depositAmount > total) {
          throw new Error('Deposit cannot exceed the order total');
        }
      }
      if (form.is_urgent && !form.rush_date) {
        throw new Error('Ship-by date is required for urgent orders');
      }
      const payload: any = {
        created_by:   user?.email || 'unknown',
        order_amount: total,
        deposit_amount: depositAmount,
        is_deposit:   form.is_deposit, // agent flags this charge as a deposit (partial payment)
        allow_deposit: false,
        deposit_pct_options: null,
      };
      if (form.customer_name.trim())    payload.customer_name    = form.customer_name.trim();
      if (form.customer_email.trim())   payload.customer_email   = form.customer_email.trim();
      if (form.customer_phone.trim())   payload.customer_phone   = form.customer_phone.trim();
      if (form.cc_email.trim())         payload.cc_email         = form.cc_email.trim();
      if (form.shipping_address.trim()) payload.shipping_address = form.shipping_address.trim();
      if (form.patches_type)            payload.patches_type     = form.patches_type;
      if (form.patches_quantity)        payload.patches_quantity = parseInt(form.patches_quantity);
      if (form.design_name.trim())      payload.design_name      = form.design_name.trim();
      if (form.design_size.trim())      payload.design_size      = form.design_size.trim();
      if (form.design_backing)          payload.design_backing   = form.design_backing;
      if (form.border_type)             payload.border_type      = form.border_type;
      if (form.country)                 payload.country          = form.country;
      if (form.purchase_order.trim())   payload.purchase_order   = form.purchase_order.trim();
      if (form.organization.trim())     payload.organization     = form.organization.trim();
      payload.sample_box = form.sample_box;
      payload.is_urgent  = form.is_urgent;
      if (form.is_urgent)               payload.rush_date        = form.rush_date;
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
      copyToClipboard(portalUrl(token));
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

  const handleCopy = async (token: string) => {
    // copyToClipboard falls back to execCommand on iOS, where navigator.clipboard fails.
    if (!(await copyToClipboard(portalUrl(token)))) {
      showError('Failed to copy', 'Long-press the link to copy it manually');
      return;
    }
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
    setForm({
      customer_name: '', customer_email: '', customer_phone: '', cc_email: '',
      shipping_address: '', patches_type: '', patches_quantity: '',
      design_name: '', design_size: '', design_backing: '', border_type: '',
      sample_box: false, country: '', purchase_order: '', organization: '',
      instructions: '', order_amount: '', deposit_amount: '', is_deposit: false,
      is_urgent: false, rush_date: '',
    });
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
                  Order Total <span className="text-red-400">*</span>
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
                <p className="text-xs text-slate-400 mt-1.5">
                  The full value of the order. For a full payment this is what the customer pays; for a deposit, set the deposit amount below.
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
                    <span className="block text-slate-400 mt-0.5">
                      The customer's page will clearly show it's a deposit, not full payment. Collect the balance separately later.
                    </span>
                  </span>
                </label>

                {/* Deposit amount — only when the charge is a deposit. This is what the
                    customer pays now; Order Total above stays the full order value. */}
                {form.is_deposit && (
                  <div className="mt-3 max-w-xs">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Deposit to Collect Now <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg font-semibold">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.deposit_amount}
                        onChange={e => setForm(f => ({ ...f, deposit_amount: e.target.value }))}
                        placeholder="0.00"
                        className="w-full pl-8 pr-4 py-3 bg-slate-800 border border-amber-500/40 focus:border-amber-500 text-white text-xl font-bold rounded-xl focus:outline-none transition-colors"
                      />
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5">
                      Charged now.{form.order_amount && form.deposit_amount && parseFloat(form.order_amount) > parseFloat(form.deposit_amount)
                        ? ` Remaining balance $${(parseFloat(form.order_amount) - parseFloat(form.deposit_amount)).toFixed(2)} collected separately later.`
                        : ' The remaining balance is collected separately later.'}
                    </p>
                  </div>
                )}
              </div>

              {/* Customer + Order details in a compact grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                <div className="space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Customer (optional)</p>
                  <FI label="Name" value={form.customer_name} onChange={v => setForm(f => ({ ...f, customer_name: v }))} placeholder="Aaron Leupp" />
                  <FI label="Email" value={form.customer_email} onChange={v => setForm(f => ({ ...f, customer_email: v }))} placeholder="aaron@example.com" type="email" />
                  <FI label="Phone" value={form.customer_phone} onChange={v => setForm(f => ({ ...f, customer_phone: v }))} placeholder="+1 623 238 6390" type="tel" />
                  <FI label="CC Email" value={form.cc_email} onChange={v => setForm(f => ({ ...f, cc_email: v }))} placeholder="agency@example.com" type="email" />
                  {/* Prefills the customer's pay page. If left blank the customer enters it there —
                      either way it now lands on the created order (City/State/ZIP parsed on insert). */}
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Shipping Address</label>
                    <textarea
                      value={form.shipping_address}
                      onChange={e => setForm(f => ({ ...f, shipping_address: e.target.value }))}
                      rows={3}
                      placeholder={'123 Main St\nHouston, TX 77001'}
                      className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 placeholder-slate-600 focus:outline-none focus:border-brand-orange resize-none"
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Order (optional)</p>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Patch Type</label>
                    <select value={form.patches_type} onChange={e => setForm(f => ({ ...f, patches_type: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-brand-orange">
                      <option value="">Select patch type…</option>
                      {PATCH_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <FI label="Qty" value={form.patches_quantity} onChange={v => setForm(f => ({ ...f, patches_quantity: v }))} placeholder="100" type="number" />
                    <FI label="Size" value={form.design_size} onChange={v => setForm(f => ({ ...f, design_size: v }))} placeholder='3"x3"' />
                  </div>
                  <FI label="Design Name" value={form.design_name} onChange={v => setForm(f => ({ ...f, design_name: v }))} placeholder="Company Logo" />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Backing</label>
                      <select value={form.design_backing} onChange={e => setForm(f => ({ ...f, design_backing: e.target.value }))}
                        className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-brand-orange">
                        <option value="">— Customer selects —</option>
                        {BACKING_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Border Type</label>
                      <select value={form.border_type} onChange={e => setForm(f => ({ ...f, border_type: e.target.value }))}
                        className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-brand-orange">
                        <option value="">— Customer selects —</option>
                        {BORDER_TYPE_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                  </div>
                  <FI label="Purchase Order #" value={form.purchase_order} onChange={v => setForm(f => ({ ...f, purchase_order: v }))} placeholder="PO-1234" />
                  <FI label="Company / End Client" value={form.organization} onChange={v => setForm(f => ({ ...f, organization: v }))} placeholder="Acme Corp" />
                  <div className="grid grid-cols-2 gap-2 items-end">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Country</label>
                      <select value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                        className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-brand-orange">
                        <option value="">— Customer selects —</option>
                        {COUNTRY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer pb-2 select-none">
                      <input
                        type="checkbox"
                        checked={form.sample_box}
                        onChange={e => setForm(f => ({ ...f, sample_box: e.target.checked }))}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-brand-orange focus:ring-brand-orange focus:ring-offset-0"
                      />
                      <span className="text-xs text-slate-300">Sample Box</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Priority — agent-only judgment call, never shown to the customer */}
              <div className="mt-4 max-w-xs">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.is_urgent}
                    onChange={e => setForm(f => ({ ...f, is_urgent: e.target.checked, rush_date: e.target.checked ? f.rush_date : '' }))}
                    className="h-5 w-5 rounded bg-slate-700 border-slate-600 text-brand-orange focus:ring-brand-orange"
                  />
                  <span className="text-sm font-bold text-slate-200">Mark as Urgent</span>
                </label>
                {form.is_urgent && (
                  <div className="mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <label className="block text-xs font-semibold text-red-400 mb-1.5 uppercase tracking-wide">
                      🚨 Required Ship-By Date
                    </label>
                    <input
                      type="date"
                      value={form.rush_date}
                      onChange={e => setForm(f => ({ ...f, rush_date: e.target.value }))}
                      min={new Date().toISOString().split('T')[0]}
                      className="block w-full bg-slate-800 border-red-500/50 rounded-md text-white focus:ring-red-500 focus:border-red-500 text-sm px-3 py-2"
                    />
                    {!form.rush_date && <p className="text-red-400 text-xs mt-1">Ship-by date is required for urgent orders</p>}
                  </div>
                )}
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
                <p className="text-[10px] text-slate-400 mt-1.5">
                  Attach the customer's design so production has the reference image when the order is created.
                </p>
              </div>

              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => createToken.mutate()}
                  disabled={createToken.isPending || uploading || !form.order_amount || parseFloat(form.order_amount) <= 0 || (form.is_deposit && (!form.deposit_amount || parseFloat(form.deposit_amount) <= 0)) || (form.is_urgent && !form.rush_date)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-brand-orange hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-colors"
                >
                  <Link className="w-4 h-4" />
                  {createToken.isPending ? 'Generating…' : `Generate $${(form.is_deposit ? parseFloat(form.deposit_amount || '0') : parseFloat(form.order_amount || '0')).toFixed(2)} Payment Link`}
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
                <p className="text-xs text-slate-400 mb-1">Payment link</p>
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
                  onClick={() => { setGeneratedToken(null); setForm(f => ({ ...f, order_amount: '', deposit_amount: '', is_deposit: false })); }}
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
          {t.customer_name || <span className="text-slate-400 italic text-xs">Name not set</span>}
          {t.patches_type && <span className="text-slate-400 text-xs ml-2">· {t.patches_type}</span>}
          {t.patches_quantity && <span className="text-slate-400 text-xs"> × {t.patches_quantity}</span>}
        </p>
        <p className="text-xs text-slate-400 truncate mt-0.5">
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
