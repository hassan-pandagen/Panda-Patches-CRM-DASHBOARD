// MarkAsPaidModal — record a payment received outside Stripe
// (Square invoice, bank transfer, cash, etc.) on a CRM order.
// Updates orders.amount_paid + status. Does NOT fire CAPI Purchase
// (manual payments are organic / repeat-customer flow — only Stripe-attributed
// purchases should hit Meta as ad-attributed conversions).

import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../services/supabaseClient';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../contexts/AuthContext';
import { X, DollarSign, CreditCard, Building2, Wallet, Hash } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  orderId: number;
  orderNumber: string;
  orderAmount: number;
  amountAlreadyPaid: number;
}

type PaymentMethod = 'square' | 'bank' | 'cash' | 'other';

const METHOD_OPTIONS: Array<{
  id: PaymentMethod;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}> = [
  { id: 'square', label: 'Square',        icon: CreditCard, description: 'Customer paid via Square invoice or terminal' },
  { id: 'bank',   label: 'Bank Transfer', icon: Building2,  description: 'Wire / ACH / direct deposit' },
  { id: 'cash',   label: 'Cash',          icon: Wallet,     description: 'Cash collected in person' },
  { id: 'other',  label: 'Other',         icon: Hash,       description: 'Any other manual payment method' },
];

const MarkAsPaidModal: React.FC<Props> = ({
  isOpen,
  onClose,
  orderId,
  orderNumber,
  orderAmount,
  amountAlreadyPaid,
}) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { success: showSuccess, error: showError } = useToast();

  const remainingDefault = Math.max(orderAmount - amountAlreadyPaid, 0);

  const [method, setMethod] = useState<PaymentMethod>('square');
  const [amount, setAmount] = useState(remainingDefault.toFixed(2));
  const [reference, setReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));

  // Reset when reopened
  useEffect(() => {
    if (isOpen) {
      setMethod('square');
      setAmount(remainingDefault.toFixed(2));
      setReference('');
      setPaymentDate(new Date().toISOString().slice(0, 10));
    }
  }, [isOpen, remainingDefault]);

  const recordPayment = useMutation({
    mutationFn: async () => {
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        throw new Error('Enter a valid payment amount');
      }
      if (amountNum > remainingDefault + 0.01) {
        throw new Error(`Amount exceeds remaining balance ($${remainingDefault.toFixed(2)})`);
      }

      const newAmountPaid = amountAlreadyPaid + amountNum;

      // Update orders table — the trigger handles status + CAPI logic
      // For manual payments (Square/bank/cash), CAPI fires too — Meta still wants
      // organic purchases, just without ad attribution (no fbp/fbc on the order).
      const { error: orderErr } = await supabase
        .from('orders')
        .update({
          amount_paid: newAmountPaid,
        })
        .eq('id', orderId);
      if (orderErr) throw orderErr;

      // Log to order_history for audit trail
      await supabase.from('order_history').insert({
        order_id: orderId,
        user_email: user?.email || 'system',
        field_changed: 'manual_payment',
        old_value: `$${amountAlreadyPaid.toFixed(2)}`,
        new_value: `$${newAmountPaid.toFixed(2)} (via ${method}${reference ? ` ref: ${reference}` : ''})`,
      });
    },
    onSuccess: () => {
      showSuccess(
        'Payment recorded',
        `$${parseFloat(amount).toFixed(2)} via ${METHOD_OPTIONS.find(m => m.id === method)?.label}`
      );
      queryClient.invalidateQueries({ queryKey: ['order'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onClose();
    },
    onError: (err: any) => {
      showError('Failed to record payment', err?.message || 'Try again');
    },
  });

  if (!isOpen) return null;

  const amountNum = parseFloat(amount) || 0;
  const newTotal = amountAlreadyPaid + amountNum;
  const willComplete = newTotal >= orderAmount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <DollarSign className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Record Manual Payment</h2>
              <p className="text-xs text-slate-400">Order {orderNumber}</p>
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
          {/* Order summary */}
          <div className="bg-slate-800/50 rounded-lg p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Order Total</span>
              <span className="text-white font-medium">${orderAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Already Paid</span>
              <span className="text-emerald-400 font-medium">${amountAlreadyPaid.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t border-white/10 pt-1.5">
              <span className="text-slate-400">Remaining</span>
              <span className="text-brand-orange font-bold">${remainingDefault.toFixed(2)}</span>
            </div>
          </div>

          {/* Payment method */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">
              Payment Method
            </label>
            <div className="grid grid-cols-2 gap-2">
              {METHOD_OPTIONS.map(opt => {
                const Icon = opt.icon;
                const selected = method === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setMethod(opt.id)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                      selected
                        ? 'border-brand-orange bg-brand-orange/10 text-white'
                        : 'border-white/10 bg-slate-800/40 text-slate-400 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
              Amount Paid <span className="text-red-400">*</span>
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
            <div className="flex gap-2 mt-2">
              {[0.5, 0.3, 1].map(pct => {
                const val = (orderAmount * pct).toFixed(2);
                return (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setAmount(val)}
                    className="text-[11px] px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded border border-white/5"
                  >
                    {pct === 1 ? 'Full' : `${Math.round(pct * 100)}%`} · ${val}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setAmount(remainingDefault.toFixed(2))}
                className="text-[11px] px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded border border-white/5"
              >
                Remaining · ${remainingDefault.toFixed(2)}
              </button>
            </div>
          </div>

          {/* Reference */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
              Reference / Receipt # <span className="text-slate-600">(optional)</span>
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Square invoice ID, bank ref, etc."
              className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-orange/50 transition-colors"
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
              Payment Date
            </label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-brand-orange/50 transition-colors"
            />
          </div>

          {/* Result preview */}
          {amountNum > 0 && (
            <div
              className={`rounded-lg p-3 text-sm border ${
                willComplete
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              }`}
            >
              {willComplete ? (
                <p>✓ This will mark the order as <strong>fully paid</strong>.</p>
              ) : (
                <p>
                  After this payment: ${newTotal.toFixed(2)} of ${orderAmount.toFixed(2)} paid
                  (${(orderAmount - newTotal).toFixed(2)} still due).
                </p>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-white/10 flex gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 border border-white/10 text-slate-300 hover:text-white hover:border-white/20 rounded-lg text-sm font-medium transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => recordPayment.mutate()}
            disabled={recordPayment.isPending || amountNum <= 0}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-all"
          >
            <DollarSign className="w-4 h-4" />
            {recordPayment.isPending ? 'Recording…' : 'Record Payment'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MarkAsPaidModal;
