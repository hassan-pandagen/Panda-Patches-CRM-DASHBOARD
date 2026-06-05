// src/pages/customer/PaymentFormLandingPage.tsx
// Public page: login.pandapatches.com/pay/:token
// Customer fills any blank fields, chooses payment option, pays via Square.
// No login required. fbp/fbc/IP/UA captured on load via store-attribution-token.

import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '../../services/supabaseClient';
import { BrandLogo } from '../../components/ui/BrandLogo';
import { CreditCard, CheckCircle, AlertCircle, Package, User, MapPin } from 'lucide-react';

// ── Browser signal helpers ────────────────────────────────────────────────────
function getCookie(name: string): string | null {
  const found = document.cookie.split('; ').find(r => r.startsWith(name + '='));
  return found ? decodeURIComponent(found.split('=')[1]) : null;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function captureAttribution(token: string) {
  try {
    const fbp = getCookie('_fbp');
    let fbc = getCookie('_fbc');
    const params = new URLSearchParams(window.location.search);
    const fbclid = params.get('fbclid');
    if (!fbc && fbclid) fbc = `fb.1.${Date.now()}.${fbclid}`;

    // Use direct fetch — no Supabase session exists on this public page
    fetch(`${SUPABASE_URL}/functions/v1/store-attribution-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        token,
        fbp: fbp || null,
        fbc: fbc || null,
        client_ua: navigator.userAgent,
        page_url: window.location.href,
        referrer: document.referrer || null,
      }),
    }).catch(() => {});
  } catch { /* ignore */ }
}

declare global { interface Window { fbq?: (...args: any[]) => void; } }

// ── Main Component ─────────────────────────────────────────────────────────────
const PaymentFormLandingPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const attributionCaptured = useRef(false);

  // Capture browser signals on mount
  useEffect(() => {
    if (token && !attributionCaptured.current) {
      attributionCaptured.current = true;
      captureAttribution(token);
    }
  }, [token]);

  const { data: tokenData, isLoading, error } = useQuery({
    queryKey: ['payment-token', token],
    queryFn: async () => {
      // Use direct fetch with anon key — no session needed, works on public page
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/payment_form_tokens?token=eq.${token}&select=*&limit=1`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (!res.ok) throw new Error('Failed to load payment form');
      const rows = await res.json();
      if (!rows || rows.length === 0) throw new Error('Payment link not found');
      return rows[0];
    },
    enabled: !!token,
    staleTime: 60_000,
    retry: 1,
  });

  if (isLoading) return <LoadingScreen />;
  if (error || !tokenData) return <ErrorScreen message="This payment link is invalid or has expired." />;
  if (tokenData.used_at) return <AlreadyPaidScreen orderNumber={tokenData.order_number} />;
  if (new Date(tokenData.expires_at) < new Date()) return <ErrorScreen message="This payment link has expired. Please contact your sales agent for a new one." />;

  return <PaymentForm tokenData={tokenData} />;
};

// ── Payment Form ───────────────────────────────────────────────────────────────
const PATCH_TYPES = [
  'Embroidered Patches', 'Woven Patches', 'PVC Patches',
  'Leather Patches', 'Chenille Patches', 'Custom 3D Embroidered Transfers',
  'Heat Transfer', 'Screen Print',
];

const BACKING_OPTIONS = ['Iron-on', 'Velcro', 'Sew-on', 'No Backing', 'Adhesive'];

const PaymentForm: React.FC<{ tokenData: any }> = ({ tokenData: tokenDataRaw }) => {
  const tokenData = tokenDataRaw ?? {};
  const [form, setForm] = useState({
    customer_name:    tokenData?.customer_name    || '',
    customer_email:   tokenData?.customer_email   || '',
    customer_phone:   tokenData?.customer_phone   || '',
    shipping_address: '',
    design_name:      tokenData?.design_name      || '',
    patches_type:     tokenData?.patches_type     || '',
    patches_quantity: tokenData?.patches_quantity ? String(tokenData.patches_quantity) : '',
    design_size:      tokenData?.design_size      || '',
    design_backing:   tokenData?.design_backing   || '',
    instructions:     tokenData?.instructions     || '',
    order_amount:     tokenData?.order_amount     ? String(tokenData.order_amount) : '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const orderAmount  = parseFloat(form.order_amount) || 0;
  const chargeAmount = orderAmount; // agent sets exact amount — no deposit toggle

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.customer_name.trim())  e.customer_name  = 'Name is required';
    if (!form.customer_email.trim()) e.customer_email = 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customer_email)) e.customer_email = 'Valid email required';
    if (!form.patches_type)          e.patches_type   = 'Patch type is required';
    if (!form.patches_quantity || parseInt(form.patches_quantity) <= 0) e.patches_quantity = 'Quantity required';
    if (!form.order_amount || orderAmount <= 0) e.order_amount = 'Order amount required';
    if (chargeAmount <= 0)           e.order_amount   = 'Amount must be greater than 0';
    return e;
  };

  const createSquareCheckout = useMutation({
    mutationFn: async () => {
      const e = validate();
      if (Object.keys(e).length > 0) { setErrors(e); throw new Error('Please fix the errors above'); }
      setErrors({});

      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/create-square-checkout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            token:            tokenData.token,
            customer_name:    form.customer_name.trim(),
            customer_email:   form.customer_email.trim(),
            customer_phone:   form.customer_phone.trim() || null,
            shipping_address: form.shipping_address.trim() || null,
            design_name:      form.design_name.trim() || null,
            patches_type:     form.patches_type,
            patches_quantity: parseInt(form.patches_quantity) || 1,
            design_size:      form.design_size.trim() || null,
            design_backing:   form.design_backing || null,
            instructions:     form.instructions.trim() || null,
            order_amount:     orderAmount,
            charge_amount:    chargeAmount,
            payment_type:     'full',
            deposit_pct:      null,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to create checkout');
      if (!data?.checkout_url) throw new Error('No checkout URL returned');
      return data.checkout_url as string;
    },
    onSuccess: (url) => {
      window.location.href = url;
    },
  });

  const set = (k: string) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="min-h-screen bg-[#0B1120] text-white">
      {/* Header */}
      <div className="border-b border-white/10 px-4 py-4 flex items-center justify-center">
        <BrandLogo className="h-8 w-auto" variant="dark" />
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Complete Your Order</h1>
          <p className="text-sm text-slate-400 mt-1">
            Fill in your details below and choose how you'd like to pay.
          </p>
        </div>

        {/* Customer Details */}
        <Section title="Your Information" icon={<User className="w-4 h-4" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Full Name *" error={errors.customer_name}>
              <input type="text" value={form.customer_name} onChange={e => set('customer_name')(e.target.value)}
                placeholder="Aaron Leupp" disabled={!!tokenData.customer_name}
                className={inputCls(!!tokenData.customer_name)} />
            </Field>
            <Field label="Email Address *" error={errors.customer_email}>
              <input type="email" value={form.customer_email} onChange={e => set('customer_email')(e.target.value)}
                placeholder="aaron@example.com" disabled={!!tokenData.customer_email}
                className={inputCls(!!tokenData.customer_email)} />
            </Field>
            <Field label="Phone Number">
              <input type="tel" value={form.customer_phone} onChange={e => set('customer_phone')(e.target.value)}
                placeholder="+1 623 238 6390"
                className={inputCls(false)} />
            </Field>
          </div>
        </Section>

        {/* Shipping */}
        <Section title="Shipping Address" icon={<MapPin className="w-4 h-4" />}>
          <Field label="Full Shipping Address">
            <input type="text" value={form.shipping_address} onChange={e => set('shipping_address')(e.target.value)}
              placeholder="8326 W Berridge Lane, Glendale, AZ 85302"
              className={inputCls(false)} />
          </Field>
        </Section>

        {/* Order Details */}
        <Section title="Order Details" icon={<Package className="w-4 h-4" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Design / Project Name">
              <input type="text" value={form.design_name} onChange={e => set('design_name')(e.target.value)}
                placeholder="Company Logo Patch" disabled={!!tokenData.design_name}
                className={inputCls(!!tokenData.design_name)} />
            </Field>
            <Field label="Patch Type *" error={errors.patches_type}>
              <select value={form.patches_type} onChange={e => set('patches_type')(e.target.value)}
                disabled={!!tokenData.patches_type}
                className={inputCls(!!tokenData.patches_type)}>
                <option value="">Select patch type…</option>
                {PATCH_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Quantity *" error={errors.patches_quantity}>
              <input type="number" value={form.patches_quantity} onChange={e => set('patches_quantity')(e.target.value)}
                placeholder="100" min="1" disabled={!!tokenData.patches_quantity}
                className={inputCls(!!tokenData.patches_quantity)} />
            </Field>
            <Field label="Size">
              <input type="text" value={form.design_size} onChange={e => set('design_size')(e.target.value)}
                placeholder='3" x 3"' disabled={!!tokenData.design_size}
                className={inputCls(!!tokenData.design_size)} />
            </Field>
            <Field label="Backing">
              <select value={form.design_backing} onChange={e => set('design_backing')(e.target.value)}
                disabled={!!tokenData.design_backing}
                className={inputCls(!!tokenData.design_backing)}>
                <option value="">Select backing…</option>
                {BACKING_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Special Instructions">
            <textarea value={form.instructions} onChange={e => set('instructions')(e.target.value)}
              placeholder="Any special notes about your design, colours, or requirements…"
              rows={3}
              className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 placeholder-slate-600 focus:outline-none focus:border-brand-orange resize-none" />
          </Field>
        </Section>

        {/* Payment */}
        <Section title="Payment" icon={<CreditCard className="w-4 h-4" />}>
          {/* Amount — locked if preset, editable if blank */}
          <Field label="Order Total ($) *" error={errors.order_amount}>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
              <input type="number" value={form.order_amount} onChange={e => set('order_amount')(e.target.value)}
                placeholder="0.00" step="0.01" min="0"
                disabled={!!tokenData.order_amount}
                className={`pl-7 ${inputCls(!!tokenData.order_amount)}`} />
            </div>
            {tokenData.order_amount && (
              <p className="text-xs text-slate-500 mt-1">Amount set by your sales agent.</p>
            )}
          </Field>


          {/* Summary */}
          {chargeAmount > 0 && (
            <div className="mt-4 p-4 bg-slate-800/50 rounded-xl border border-white/10">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">You'll be charged today</span>
                <span className="text-white font-bold text-lg">${chargeAmount.toFixed(2)}</span>
              </div>
              <p className="text-[10px] text-slate-600 mt-2">
                Secure payment via Square · You'll be redirected to Square's checkout page.
              </p>
            </div>
          )}

          {createSquareCheckout.isError && (
            <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-300">
              {(createSquareCheckout.error as any)?.message || 'Something went wrong. Please try again.'}
            </div>
          )}

          <button
            onClick={() => createSquareCheckout.mutate()}
            disabled={createSquareCheckout.isPending || chargeAmount <= 0}
            className="mt-4 w-full flex items-center justify-center gap-2 py-4 bg-brand-orange hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-base transition-colors shadow-lg shadow-brand-orange/20"
          >
            <CreditCard className="w-5 h-5" />
            {createSquareCheckout.isPending
              ? 'Redirecting to Square…'
              : `Pay $${chargeAmount.toFixed(2)} via Square`}
          </button>
        </Section>
      </div>
    </div>
  );
};

// ── Helper components ──────────────────────────────────────────────────────────

const inputCls = (disabled: boolean) =>
  `w-full bg-slate-800 border text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none transition-colors ${
    disabled
      ? 'border-slate-700 opacity-70 cursor-not-allowed'
      : 'border-slate-700 placeholder-slate-600 focus:border-brand-orange'
  }`;

const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-5 space-y-4">
    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
      <span className="text-brand-orange">{icon}</span>
      {title}
    </h3>
    {children}
  </div>
);

const Field: React.FC<{ label: string; error?: string; children: React.ReactNode }> = ({ label, error, children }) => (
  <div>
    <label className="block text-xs text-slate-400 mb-1">{label}</label>
    {children}
    {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
  </div>
);

const LoadingScreen = () => (
  <div className="min-h-screen bg-[#0B1120] flex items-center justify-center">
    <div className="w-10 h-10 border-4 border-brand-orange border-t-transparent rounded-full animate-spin" />
  </div>
);

const ErrorScreen: React.FC<{ message: string }> = ({ message }) => (
  <div className="min-h-screen bg-[#0B1120] flex items-center justify-center p-4">
    <div className="text-center max-w-sm">
      <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
      <h2 className="text-lg font-semibold text-white mb-2">Link Unavailable</h2>
      <p className="text-sm text-slate-400">{message}</p>
      <p className="text-xs text-slate-600 mt-4">Need help? Contact us at hello@pandapatches.com</p>
    </div>
  </div>
);

const AlreadyPaidScreen: React.FC<{ orderNumber: string | null }> = ({ orderNumber }) => (
  <div className="min-h-screen bg-[#0B1120] flex items-center justify-center p-4">
    <div className="text-center max-w-sm">
      <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
      <h2 className="text-lg font-semibold text-white mb-2">Already Paid!</h2>
      <p className="text-sm text-slate-400">
        This payment link has already been used.
        {orderNumber && <> Your order <span className="text-brand-orange font-semibold">{orderNumber}</span> is in progress.</>}
      </p>
      <p className="text-xs text-slate-600 mt-4">Questions? Contact hello@pandapatches.com</p>
    </div>
  </div>
);

export default PaymentFormLandingPage;
