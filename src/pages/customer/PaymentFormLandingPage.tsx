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
import { PATCHES_TYPE_OPTIONS, DESIGN_BACKING_OPTIONS, COUNTRY_OPTIONS } from '../../constants/index';

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

// ── Deadline guard ────────────────────────────────────────────────────────────
// Runs a network call under a hard deadline that covers BOTH phases of a fetch: the response
// headers AND the body read. The previous guard wrapped only fetch() itself and cleared its
// timer as soon as the headers arrived, so a response whose body then stalled left the
// following res.json() awaiting forever — the request looked complete at the network layer
// while the page sat on its spinner with no rejection to catch, no retry, and no way out.
// Holding the signal through the body read makes that stall abort like any other.
//
// The wall-clock race is the backstop for in-app browsers (WhatsApp/Instagram) that can
// freeze a request without honouring abort() at all.
async function withDeadline<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), ms);
  let hardTimer: ReturnType<typeof setTimeout> | undefined;
  const hardStop = new Promise<never>((_, reject) => {
    hardTimer = setTimeout(() => reject(new Error('TIMEOUT')), ms + 2_000);
  });
  hardStop.catch(() => { /* losing the race must not surface as an unhandled rejection */ });
  try {
    return await Promise.race([run(controller.signal), hardStop]);
  } catch (err: any) {
    if (err?.name === 'AbortError' || err?.message === 'TIMEOUT') throw new Error('TIMEOUT');
    throw err;
  } finally {
    clearTimeout(abortTimer);
    clearTimeout(hardTimer);
  }
}

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

  const { data: tokenData, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['payment-token', token],
    // Read through the get_payment_form_token RPC rather than selecting the table directly.
    // Direct anon SELECT on payment_form_tokens let anyone with the anon key — which ships in
    // this bundle — enumerate all 215 rows with their customers' names, emails, phones and
    // addresses, no token needed. The RPC returns one row by token and only the columns this
    // page renders (no attribution/client_ip, no created_by), so the unguessable token is the
    // capability. See supabase/migrations/lock_down_anon_rpc_and_payment_tokens.sql.
    //
    // Still no session here, so it stays a direct fetch with the anon key, and the whole read
    // still runs under one deadline — neither a stalled request nor a stalled response body can
    // leave the customer on an endless spinner; retry: 1 gets a second attempt, which is usually
    // all a transient stall needs.
    queryFn: () =>
      withDeadline(12_000, async (signal) => {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/rpc/get_payment_form_token`,
          {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ p_token: token }),
            signal,
          }
        );
        if (!res.ok) throw new Error('Failed to load payment form');
        const rows = await res.json();
        if (!Array.isArray(rows) || rows.length === 0) throw new Error('Payment link not found');
        return rows[0];
      }),
    enabled: !!token,
    staleTime: 60_000,
    retry: 1,
  });

  const isTimeout = (error as Error | null)?.message === 'TIMEOUT';

  if (isLoading) return <LoadingScreen />;
  if (isTimeout) {
    return (
      <ErrorScreen
        message="This is taking longer than expected. If you opened this link inside WhatsApp, Instagram, or another app, try opening it in your regular browser (Chrome/Safari) instead — those in-app browsers sometimes get stuck."
        onRetry={() => refetch()}
        isRetrying={isRefetching}
      />
    );
  }
  if (error || !tokenData) return <ErrorScreen message="This payment link is invalid or has expired." onRetry={() => refetch()} isRetrying={isRefetching} />;
  if (tokenData.used_at) return <AlreadyPaidScreen orderNumber={tokenData.order_number} />;
  if (new Date(tokenData.expires_at) < new Date()) return <ErrorScreen message="This payment link has expired. Please contact your sales agent for a new one." />;

  return <PaymentForm tokenData={tokenData} />;
};

// ── Payment Form ───────────────────────────────────────────────────────────────
// Single source of truth — shared with the CRM order form + agent payment form.
const PATCH_TYPES = PATCHES_TYPE_OPTIONS;
const BACKING_OPTIONS = DESIGN_BACKING_OPTIONS;
// Not a shared constant — mirrors the hardcoded list in OrderForm.tsx / PaymentFormPage.tsx.
const BORDER_TYPE_OPTIONS = ['Merrow Border', 'Embroidery Border', 'Laser Cut', 'No Border'];

const PaymentForm: React.FC<{ tokenData: any }> = ({ tokenData: tokenDataRaw }) => {
  const tokenData = tokenDataRaw ?? {};
  const [form, setForm] = useState({
    customer_name:    tokenData?.customer_name    || '',
    customer_email:   tokenData?.customer_email   || '',
    customer_phone:   tokenData?.customer_phone   || '',
    shipping_address: tokenData?.shipping_address || '',
    design_name:      tokenData?.design_name      || '',
    patches_type:     tokenData?.patches_type     || '',
    patches_quantity: tokenData?.patches_quantity ? String(tokenData.patches_quantity) : '',
    design_size:      tokenData?.design_size      || '',
    design_backing:   tokenData?.design_backing   || '',
    border_type:      tokenData?.border_type      || '',
    sample_box:       tokenData?.sample_box       || false,
    country:          tokenData?.country          || '',
    purchase_order:   tokenData?.purchase_order   || '',
    organization:     tokenData?.organization     || '',
    instructions:     tokenData?.instructions     || '',
    order_amount:     tokenData?.order_amount     ? String(tokenData.order_amount) : '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Sample Box is a paid add-on when the CUSTOMER opts in themselves — but if the agent already
  // included it for free (tokenData.sample_box), the checkbox is locked on and stays free (see
  // the disabled={!!tokenData.sample_box} prop below), matching how every other prefilled field
  // on this page works.
  const SAMPLE_BOX_FEE = 20;
  const sampleBoxIsPaidAddOn = form.sample_box && !tokenData?.sample_box;
  const sampleBoxFee = sampleBoxIsPaidAddOn ? SAMPLE_BOX_FEE : 0;

  const baseOrderAmount = parseFloat(form.order_amount) || 0; // agent-set total, before add-ons
  const orderAmount  = baseOrderAmount + sampleBoxFee; // full order total, incl. any add-ons
  const isDeposit    = !!tokenData?.is_deposit; // agent flagged this charge as a deposit
  const depositAmount = tokenData?.deposit_amount ? Number(tokenData.deposit_amount) : 0;
  // Charge only the deposit when this is a deposit link; order_amount stays the full total
  // so the created order shows Total / Paid / Remaining correctly. Legacy deposit links
  // (created before deposit_amount existed) have no deposit_amount → charge the full amount
  // as they did before, so nothing is ever over-charged. The Sample Box add-on is always
  // collected up front (added once, whichever branch is taken), on top of whatever's being
  // charged today.
  const isDepositLink = isDeposit && depositAmount > 0;
  const chargeAmount = (isDepositLink ? depositAmount : baseOrderAmount) + sampleBoxFee;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.customer_name.trim())  e.customer_name  = 'Name is required';
    if (!form.customer_email.trim()) e.customer_email = 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customer_email)) e.customer_email = 'Valid email required';
    if (!form.patches_type)          e.patches_type   = 'Patch type is required';
    if (!form.patches_quantity || parseInt(form.patches_quantity) <= 0) e.patches_quantity = 'Quantity required';
    if (!form.order_amount || baseOrderAmount <= 0) e.order_amount = 'Order amount required';
    if (chargeAmount <= 0)           e.order_amount   = 'Amount must be greater than 0';
    return e;
  };

  const createSquareCheckout = useMutation({
    mutationFn: async () => {
      const e = validate();
      if (Object.keys(e).length > 0) { setErrors(e); throw new Error('Please fix the errors above'); }
      setErrors({});

      // Same deadline guard as the token load. Without it a stalled response body would
      // pin the button on "Redirecting to Square…" forever, on the one action that matters
      // most — the customer has no way to tell a hung request from a slow one.
      return await withDeadline(20_000, async (signal) => {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/create-square-checkout`,
          {
            method: 'POST',
            signal,
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
              border_type:      form.border_type || null,
              sample_box:       form.sample_box,
              country:          form.country || null,
              purchase_order:   form.purchase_order.trim() || null,
              organization:     form.organization.trim() || null,
              instructions:     form.instructions.trim() || null,
              order_amount:     orderAmount,
              charge_amount:    chargeAmount,
              sample_box_fee:   sampleBoxFee,
              payment_type:     isDeposit ? 'deposit' : 'full',
              deposit_pct:      null,
            }),
          }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to create checkout');
        if (!data?.checkout_url) throw new Error('No checkout URL returned');
        return data.checkout_url as string;
      }).catch((err: any) => {
        if (err?.message === 'TIMEOUT') {
          throw new Error('That took too long. Please check your connection and try again.');
        }
        throw err;
      });
    },
    onSuccess: (url) => {
      window.location.href = url;
    },
  });

  const set = (k: string) => (v: string) => setForm(f => ({ ...f, [k]: v }));
  const setBool = (k: string) => (v: boolean) => setForm(f => ({ ...f, [k]: v }));

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
          {/* CL0FAA §1: invoice number, visible before the order/payment exists. Becomes
              INV-{order_number} once this form converts to an order on payment. */}
          {tokenData?.id != null && (
            <p className="text-xs text-slate-400">
              Invoice No. <span className="text-slate-200 font-mono">INV-PF-{tokenData.id}</span>
            </p>
          )}
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
            <Field label="Border Type">
              <select value={form.border_type} onChange={e => set('border_type')(e.target.value)}
                disabled={!!tokenData.border_type}
                className={inputCls(!!tokenData.border_type)}>
                <option value="">Select border…</option>
                {BORDER_TYPE_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </Field>
            <Field label="Country">
              <select value={form.country} onChange={e => set('country')(e.target.value)}
                disabled={!!tokenData.country}
                className={inputCls(!!tokenData.country)}>
                <option value="">Select country…</option>
                {COUNTRY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Purchase Order #">
              <input type="text" value={form.purchase_order} onChange={e => set('purchase_order')(e.target.value)}
                placeholder="PO-1234" disabled={!!tokenData.purchase_order}
                className={inputCls(!!tokenData.purchase_order)} />
            </Field>
            <Field label="Company / End Client">
              <input type="text" value={form.organization} onChange={e => set('organization')(e.target.value)}
                placeholder="Acme Corp" disabled={!!tokenData.organization}
                className={inputCls(!!tokenData.organization)} />
            </Field>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
            <input
              type="checkbox"
              checked={form.sample_box}
              onChange={e => setBool('sample_box')(e.target.checked)}
              disabled={!!tokenData.sample_box}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-brand-orange focus:ring-brand-orange focus:ring-offset-0 disabled:opacity-70"
            />
            <span className="text-sm text-slate-300">
              Include a Sample Box{tokenData?.sample_box ? '' : ` (+$${SAMPLE_BOX_FEE})`}
            </span>
          </label>
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
              <p className="text-xs text-slate-400 mt-1">Amount set by your sales agent.</p>
            )}
          </Field>


          {/* Summary */}
          {chargeAmount > 0 && (
            <div className={`mt-4 p-4 rounded-xl border ${isDeposit ? 'bg-amber-500/5 border-amber-500/25' : 'bg-slate-800/50 border-white/10'}`}>
              {isDeposit && (
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded bg-amber-500/20 text-amber-300">
                    Deposit
                  </span>
                  <span className="text-xs text-amber-200/80">Partial payment — not full</span>
                </div>
              )}
              {sampleBoxFee > 0 && (
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>Sample Box add-on</span>
                  <span>+${sampleBoxFee.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">{isDeposit ? "Deposit due today" : "You'll be charged today"}</span>
                <span className="text-white font-bold text-lg">${chargeAmount.toFixed(2)}</span>
              </div>
              {isDeposit && (
                <p className="text-[11px] text-amber-200/70 mt-2">
                  This is a deposit to start your order. The remaining balance will be arranged with your sales agent.
                </p>
              )}
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
              : `Pay $${chargeAmount.toFixed(2)}${isDeposit ? ' Deposit' : ''} via Square`}
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

const LoadingScreen = () => {
  // A bare spinner gives no sign that anything is still happening, so a slow-but-working load
  // looks exactly like a hung one. Say something once it stops feeling instant.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 5_000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="min-h-screen bg-[#0B1120] flex flex-col items-center justify-center gap-4 p-4">
      <div className="w-10 h-10 border-4 border-brand-orange border-t-transparent rounded-full animate-spin" />
      {slow && <p className="text-xs text-slate-500">Loading your order details…</p>}
    </div>
  );
};

const ErrorScreen: React.FC<{ message: string; onRetry?: () => void; isRetrying?: boolean }> = ({ message, onRetry, isRetrying }) => (
  <div className="min-h-screen bg-[#0B1120] flex items-center justify-center p-4">
    <div className="text-center max-w-sm">
      <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
      <h2 className="text-lg font-semibold text-white mb-2">Link Unavailable</h2>
      <p className="text-sm text-slate-400">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          disabled={isRetrying}
          className="mt-4 px-5 py-2.5 bg-brand-orange hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors"
        >
          {isRetrying ? 'Retrying…' : 'Try Again'}
        </button>
      )}
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
