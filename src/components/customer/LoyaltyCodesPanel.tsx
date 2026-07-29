// src/components/customer/LoyaltyCodesPanel.tsx
// CL86F1 Task 2.3 — the customer's loyalty codes, their status and redemptions. Staff-only
// (loyalty_codes is staff-SELECT via RLS). Hidden entirely if the customer has no codes.
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getLoyaltyCodes } from '../../services/loyaltyService';
import { Ticket } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const STATUS_CLS: Record<string, string> = {
  active:   'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  redeemed: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  revoked:  'bg-red-500/15 text-red-300 border-red-500/30',
};

const LoyaltyCodesPanel: React.FC<{ customerId: string }> = ({ customerId }) => {
  const { data: codes = [], isLoading } = useQuery({
    queryKey: ['loyalty-codes', customerId],
    queryFn: () => getLoyaltyCodes(customerId),
    enabled: !!customerId,
  });

  if (isLoading || codes.length === 0) return null;

  const expired = (c: { expiresAt: string | null; status: string }) =>
    c.status === 'active' && c.expiresAt != null && new Date(c.expiresAt).getTime() < Date.now();

  return (
    <div className="relative bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
      <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
        <Ticket size={18} className="text-brand-orange" /> Loyalty Codes
      </h3>
      <p className="text-xs text-slate-400 mb-4">Personal discount codes — tied to this customer's email.</p>

      <div className="space-y-2">
        {codes.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-800/40 border border-white/5"
          >
            <div className="min-w-0">
              <div className="font-mono text-sm text-white truncate">{c.code}</div>
              <div className="text-xs text-slate-400 mt-0.5">
                {c.percent}% · {c.tier} · {c.singleUse ? 'single-use' : 'reusable'}
                {c.expiresAt && ` · expires ${format(parseISO(c.expiresAt), 'MMM d, yyyy')}`}
                {c.redeemedAt && ` · redeemed ${format(parseISO(c.redeemedAt), 'MMM d, yyyy')}`}
              </div>
            </div>
            <span
              className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                expired(c) ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : STATUS_CLS[c.status]
              }`}
            >
              {expired(c) ? 'expired' : c.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LoyaltyCodesPanel;
