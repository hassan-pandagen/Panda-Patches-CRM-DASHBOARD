// CorrectPaymentModal — fix a payment recorded in error (e.g. a manual payment fat-fingered
// against an order that wasn't actually paid). Overwrites the recorded Amount Paid via the
// admin/financial-editor RPC `correct_order_payment` (SECURITY DEFINER, audited, reason required).
// This is NOT a refund — confirmed Square/webhook payments are blocked server-side and must be
// refunded in Square. Complements MarkAsPaidModal, which can only ADD to Amount Paid.

import React, { useState, useEffect, useId } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../services/supabaseClient';
import { useToast } from '../../hooks/useToast';
import Modal from '../ui/Modal';
import { X, RotateCcw, AlertTriangle } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  orderId: number;
  orderNumber: string;
  orderAmount: number;
  amountAlreadyPaid: number;
}

const CorrectPaymentModal: React.FC<Props> = ({
  isOpen,
  onClose,
  orderId,
  orderNumber,
  orderAmount,
  amountAlreadyPaid,
}) => {
  const queryClient = useQueryClient();
  const { success: showSuccess, error: showError } = useToast();
  const titleId = useId();

  const [amount, setAmount] = useState('0.00');
  const [reason, setReason] = useState('');

  // Reset each time it opens
  useEffect(() => {
    if (isOpen) {
      setAmount('0.00');
      setReason('');
    }
  }, [isOpen]);

  const correct = useMutation({
    mutationFn: async () => {
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum < 0) throw new Error('Enter a valid amount (0 or more)');
      if (amountNum > orderAmount + 0.01) {
        throw new Error(`Amount can't exceed the order total ($${orderAmount.toFixed(2)})`);
      }
      if (!reason.trim()) throw new Error('Please add a reason');

      // Server-side: enforces orders_edit_financials, protects real Square payments, writes audit.
      const { error } = await supabase.rpc('correct_order_payment', {
        p_order_id: orderId,
        p_new_amount_paid: amountNum,
        p_reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess('Payment corrected', `Amount Paid set to $${(parseFloat(amount) || 0).toFixed(2)}`);
      // Prefix match refreshes both the list and the single-order query.
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onClose();
    },
    onError: (err: any) => {
      showError('Failed to correct payment', err?.message || 'Try again');
    },
  });

  const amountNum = parseFloat(amount) || 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} labelledBy={titleId} size="sm">
      <div>
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <RotateCcw className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 id={titleId} className="text-lg font-semibold text-white">Correct Payment</h2>
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
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 flex gap-2 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Fixes a payment recorded by mistake — it <strong>overwrites</strong> the recorded Amount
              Paid and is <strong>not</strong> a refund. A confirmed Square payment can't be corrected
              here; refund it in Square instead.
            </span>
          </div>

          <div className="bg-slate-800/50 rounded-lg p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Order Total</span>
              <span className="text-white font-medium">${orderAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Currently Recorded</span>
              <span className="text-emerald-400 font-medium">${amountAlreadyPaid.toFixed(2)}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
              Corrected Amount Paid <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full pl-7 pr-4 py-2.5 bg-slate-800 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-amber-400/50 transition-colors"
              />
            </div>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => setAmount('0.00')}
                className="text-[11px] px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded border border-white/5"
              >
                Set to $0 (unpaid)
              </button>
              <button
                type="button"
                onClick={() => setAmount(orderAmount.toFixed(2))}
                className="text-[11px] px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded border border-white/5"
              >
                Full · ${orderAmount.toFixed(2)}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
              Reason <span className="text-red-400">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. recorded in error — customer hasn't paid yet"
              className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition-colors resize-none"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-white/10 flex gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 border border-white/10 text-slate-300 hover:text-white hover:border-white/20 rounded-lg text-sm font-medium transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => correct.mutate()}
            disabled={correct.isPending || !reason.trim() || amountNum > orderAmount + 0.01}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-all"
          >
            <RotateCcw className="w-4 h-4" />
            {correct.isPending ? 'Saving…' : 'Correct Payment'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default CorrectPaymentModal;
