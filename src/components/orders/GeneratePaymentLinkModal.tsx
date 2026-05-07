// GeneratePaymentLinkModal — agent creates a Stripe Checkout link for an order
// then sends it to the customer via WhatsApp / Email / Copy.
//
// On payment, our stripe-balance-webhook updates orders.amount_paid → trigger fires CAPI Purchase.

import React, { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '../../services/supabaseClient';
import { useToast } from '../../hooks/useToast';
import {
  X, CreditCard, Copy, MessageCircle, Mail, ExternalLink, Check, Send,
} from 'lucide-react';

type OrderModeProps = {
  mode?: 'order';
  orderId: number;
  orderNumber: string;
  orderAmount: number;
  amountAlreadyPaid: number;
};

type QuoteModeProps = {
  mode: 'quote';
  quoteId: number;
  quoteNumber: string;
  quoteAmount: number;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
} & (OrderModeProps | QuoteModeProps);

type PaymentLabel = 'deposit' | 'balance' | 'full' | 'custom';

const GeneratePaymentLinkModal: React.FC<Props> = (props) => {
  const { isOpen, onClose, customerName, customerEmail, customerPhone } = props;
  const isQuoteMode = props.mode === 'quote';

  // Derived values per mode
  const refNumber  = isQuoteMode ? props.quoteNumber  : (props as OrderModeProps).orderNumber;
  const totalAmount = isQuoteMode ? props.quoteAmount  : (props as OrderModeProps).orderAmount;
  const alreadyPaid = isQuoteMode ? 0                 : (props as OrderModeProps).amountAlreadyPaid;

  const { success: showSuccess, error: showError } = useToast();
  const remainingDefault = Math.max(totalAmount - alreadyPaid, 0);

  const [label, setLabel] = useState<PaymentLabel>(alreadyPaid === 0 ? 'deposit' : 'balance');
  const [amount, setAmount] = useState(remainingDefault.toFixed(2));
  const [copied, setCopied] = useState(false);
  const [sentViaEmail, setSentViaEmail] = useState(false);
  const [generated, setGenerated] = useState<{
    url: string;
    amount: number;
    customerEmail: string;
    customerName: string;
  } | null>(null);

  // Reset state on reopen
  useEffect(() => {
    if (isOpen) {
      setLabel(alreadyPaid === 0 ? 'deposit' : 'balance');
      setAmount(remainingDefault.toFixed(2));
      setCopied(false);
      setSentViaEmail(false);
      setGenerated(null);
    }
  }, [isOpen, remainingDefault, alreadyPaid]);

  // Async pattern: kick off the Stripe call (returns instantly with request_id),
  // then poll get_stripe_payment_link_response every second until it returns
  // status=ready or status=error. This avoids holding a Postgres connection open
  // for the 10s Stripe takes — see migrations/stripe_payment_link_async_pattern.sql.
  const generate = useMutation({
    mutationFn: async () => {
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) throw new Error('Enter a valid amount');
      if (amountNum > remainingDefault + 0.01) {
        throw new Error(`Amount exceeds remaining balance ($${remainingDefault.toFixed(2)})`);
      }

      // 1. Kick off the request — returns instantly
      const rpcName = isQuoteMode
        ? 'create_stripe_quote_payment_link_request'
        : 'create_stripe_payment_link_request';
      const rpcParams = isQuoteMode
        ? { p_quote_id: (props as QuoteModeProps).quoteId, p_amount: amountNum, p_label: label }
        : { p_order_id: (props as OrderModeProps).orderId, p_amount: amountNum, p_label: label };

      const { data: requestData, error: requestErr } = await supabase.rpc(rpcName, rpcParams);
      if (requestErr) {
        throw new Error(requestErr.message || 'Failed to create payment link');
      }
      const requestId = requestData?.request_id;
      const ctx = {
        order_number: requestData?.order_number ?? requestData?.quote_number,
        customer_email: requestData?.customer_email,
        customer_name: requestData?.customer_name,
        amount: requestData?.amount,
      };
      if (!requestId) throw new Error('No request_id returned');

      // 2. Poll for result — up to 30s (Stripe usually responds in 8-12s)
      const maxAttempts = 30;
      const intervalMs = 1000;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, intervalMs));
        const { data: respData, error: respErr } = await supabase.rpc(
          'get_stripe_payment_link_response',
          { p_request_id: requestId }
        );
        if (respErr) throw new Error(respErr.message);
        if (respData?.status === 'ready') {
          return { ...respData, ...ctx };
        }
        if (respData?.status === 'error') {
          throw new Error(respData.message || 'Stripe rejected the request');
        }
        if (respData?.status === 'timeout') {
          throw new Error('Stripe did not respond in time. Please try again.');
        }
        // status === 'pending' — keep polling
      }
      throw new Error('Stripe did not respond within 30 seconds');
    },
    onSuccess: (data: any) => {
      setGenerated({
        url: data.url,
        amount: data.amount,
        customerEmail: data.customer_email || '',
        customerName: data.customer_name || '',
      });
      showSuccess('Payment link generated!');
    },
    onError: (err: any) => showError('Failed to create link', err?.message || 'Try again'),
  });

  const handleCopy = async () => {
    if (!generated) return;
    await navigator.clipboard.writeText(generated.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleWhatsApp = () => {
    if (!generated || !customerPhone) return;
    const firstName = (generated.customerName || 'there').split(' ')[0];
    const msg =
      `Hi ${firstName}! Here's your secure payment link for ${isQuoteMode ? 'quote' : 'order'} ${refNumber} ` +
      `(${label} — $${generated.amount.toFixed(2)} USD):\n\n${generated.url}\n\n` +
      `Once paid, you'll see the update in your portal. Thanks! — Panda Patches`;
    const cleanPhone = customerPhone.replace(/\D/g, '');
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const sendEmail = useMutation({
    mutationFn: async () => {
      if (!generated || !generated.customerEmail) throw new Error('No customer email on file');
      const firstName = (generated.customerName || 'there').split(' ')[0];

      const { error } = await supabase.functions.invoke('send-email', {
        body: {
          to: generated.customerEmail,
          template_id: 'CUSTOMER_PAYMENT_LINK',
          dynamic_data: {
            customer_name: firstName,
            order_number: refNumber,
            amount: `$${generated.amount.toFixed(2)}`,
            payment_kind: label,
            portal_action_url: generated.url,
          },
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setSentViaEmail(true);
      showSuccess('Email sent', `Payment link emailed to ${generated?.customerEmail}`);
      setTimeout(() => setSentViaEmail(false), 4000);
    },
    onError: (err: any) => showError('Email failed', err?.message || 'Try again'),
  });

  if (!isOpen) return null;

  const amountNum = parseFloat(amount) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <CreditCard className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Generate Stripe Payment Link</h2>
              <p className="text-xs text-slate-400">{isQuoteMode ? 'Quote' : 'Order'} {refNumber}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {!generated ? (
            <>
              {/* Order context */}
              <div className="bg-slate-800/50 rounded-lg p-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Customer</span>
                  <span className="text-white font-medium">
                    {customerName || customerEmail || 'Unknown'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">{isQuoteMode ? 'Quote Amount' : 'Order Total'}</span>
                  <span className="text-white font-medium">${totalAmount.toFixed(2)}</span>
                </div>
                {!isQuoteMode && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Already Paid</span>
                    <span className="text-emerald-400 font-medium">${alreadyPaid.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-white/10 pt-1.5">
                  <span className="text-slate-400">{isQuoteMode ? 'Charge Amount' : 'Remaining'}</span>
                  <span className="text-brand-orange font-bold">${remainingDefault.toFixed(2)}</span>
                </div>
              </div>

              {/* Payment label */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">
                  Payment Type
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'deposit' as PaymentLabel, label: 'Deposit' },
                    { id: 'balance' as PaymentLabel, label: 'Balance' },
                    { id: 'full' as PaymentLabel, label: 'Full' },
                    { id: 'custom' as PaymentLabel, label: 'Custom' },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setLabel(opt.id)}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                        label === opt.id
                          ? 'border-brand-orange bg-brand-orange/10 text-white'
                          : 'border-white/10 bg-slate-800/40 text-slate-400 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                  Amount to Charge <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full pl-7 pr-4 py-2.5 bg-slate-800 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-brand-orange/50 transition-colors"
                  />
                </div>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {[0.3, 0.5, 1].map(pct => {
                    const val = (totalAmount * pct).toFixed(2);
                    return (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => {
                          setAmount(val);
                          setLabel(pct === 1 ? 'full' : 'deposit');
                        }}
                        className="text-[11px] px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded border border-white/5"
                      >
                        {pct === 1 ? 'Full' : `${Math.round(pct * 100)}%`} · ${val}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      setAmount(remainingDefault.toFixed(2));
                      setLabel('balance');
                    }}
                    className="text-[11px] px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded border border-white/5"
                  >
                    Remaining · ${remainingDefault.toFixed(2)}
                  </button>
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-200">
                {isQuoteMode ? (
                  <p>
                    📌 The link expires in 7 days. Once the customer pays, a new order is
                    created automatically and Meta CAPI Purchase fires. The quote is deleted.
                  </p>
                ) : (
                  <p>
                    📌 The link expires in 7 days. Once paid, the order auto-updates to
                    partially_paid (deposit) or paid (full/balance), and Meta CAPI Purchase
                    fires automatically.
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Success view — show generated link + share buttons */}
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 flex items-start gap-3">
                <div className="p-1.5 bg-emerald-500/20 rounded-md shrink-0">
                  <Check className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-emerald-300 mb-1">
                    Payment link created — ${generated.amount.toFixed(2)}
                  </p>
                  <p className="text-xs text-emerald-200/80 break-all font-mono">
                    {generated.url}
                  </p>
                </div>
              </div>

              {/* Send via... */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-3 uppercase tracking-wider">
                  Send to {generated.customerName || generated.customerEmail || 'customer'} via:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={handleCopy}
                    className="flex flex-col items-center gap-1.5 px-3 py-3 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded-lg transition-all"
                  >
                    {copied ? (
                      <>
                        <Check className="w-5 h-5 text-emerald-400" />
                        <span className="text-xs text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-5 h-5 text-slate-300" />
                        <span className="text-xs text-slate-300">Copy Link</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleWhatsApp}
                    disabled={!customerPhone}
                    title={customerPhone ? '' : 'No phone number on file'}
                    className="flex flex-col items-center gap-1.5 px-3 py-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <MessageCircle className="w-5 h-5 text-emerald-400" />
                    <span className="text-xs text-emerald-400">WhatsApp</span>
                  </button>

                  <button
                    onClick={() => sendEmail.mutate()}
                    disabled={sendEmail.isPending || !generated.customerEmail}
                    title={generated.customerEmail ? '' : 'No email on file'}
                    className="flex flex-col items-center gap-1.5 px-3 py-3 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {sentViaEmail ? (
                      <>
                        <Check className="w-5 h-5 text-emerald-400" />
                        <span className="text-xs text-emerald-400">Sent!</span>
                      </>
                    ) : (
                      <>
                        <Mail className="w-5 h-5 text-blue-400" />
                        <span className="text-xs text-blue-400">
                          {sendEmail.isPending ? 'Sending…' : 'Email'}
                        </span>
                      </>
                    )}
                  </button>
                </div>
                {!customerPhone && (
                  <p className="text-[10px] text-slate-500 mt-2">
                    💡 Add a phone number to the customer record to enable WhatsApp share.
                  </p>
                )}
              </div>

              <a
                href={generated.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 text-xs text-slate-400 hover:text-white border border-white/5 rounded-lg transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Preview link as customer would see it
              </a>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-white/10 flex gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 border border-white/10 text-slate-300 hover:text-white hover:border-white/20 rounded-lg text-sm font-medium transition-all"
          >
            {generated ? 'Done' : 'Cancel'}
          </button>
          {!generated && (
            <button
              onClick={() => generate.mutate()}
              disabled={generate.isPending || amountNum <= 0}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-orange hover:bg-brand-orange/90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-all"
            >
              <Send className="w-4 h-4" />
              {generate.isPending ? 'Creating link…' : `Generate $${amountNum.toFixed(2)} Link`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default GeneratePaymentLinkModal;
