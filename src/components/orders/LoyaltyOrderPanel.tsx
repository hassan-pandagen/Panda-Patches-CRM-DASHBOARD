// src/components/orders/LoyaltyOrderPanel.tsx
// CL86F1 Task 2.5 (informational) — in the Add Order / Edit Order form, surfaces the
// customer's loyalty tier + usable codes + perks so the agent can price accordingly.
// Applying a code RECORDS it on the order (fires redemption + the E6 line on a paid order);
// it deliberately does NOT change Order Amount — the agent sets the final total by hand
// (the CRM prices manually; no itemized calculator). Hidden if the customer has no tier.
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCustomerByEmail } from '../../services/customersService';
import { getLoyaltyCodes } from '../../services/loyaltyService';
import LoyaltyBadge from '../ui/LoyaltyBadge';
import { Ticket, Check } from 'lucide-react';

interface Props {
  customerEmail?: string;
  orderAmount: number;
  appliedCode?: string | null;
  onApply: (code: string | null, percent: number | null) => void;
}

const money = (n: number) => '$' + (Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const LoyaltyOrderPanel: React.FC<Props> = ({ customerEmail, orderAmount, appliedCode, onApply }) => {
  const email = (customerEmail || '').trim().toLowerCase();

  const { data: customer } = useQuery({
    queryKey: ['customer-by-email', email],
    queryFn: () => getCustomerByEmail(email),
    enabled: !!email,
  });

  const { data: codes = [] } = useQuery({
    queryKey: ['loyalty-codes', customer?.id],
    queryFn: () => getLoyaltyCodes(customer!.id),
    enabled: !!customer?.id,
  });

  if (!customer || customer.loyaltyTier === 'none') return null;

  const usable = codes.filter(
    (c) => c.status === 'active' && (!c.expiresAt || new Date(c.expiresAt).getTime() >= Date.now())
  );

  const appliedPercent = usable.find((c) => c.code === appliedCode)?.percent ?? null;
  const perks: string[] = [];
  if (customer.loyaltyTier === 'silver' || customer.loyaltyTier === 'gold') perks.push('Velcro backing is free');
  if (customer.loyaltyTier === 'gold') perks.push('one free rush upgrade per quarter');

  return (
    <div className="rounded-lg border border-brand-orange/30 bg-brand-orange/5 p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Ticket size={16} className="text-brand-orange" />
        <span className="text-sm font-semibold text-white">Loyalty</span>
        <LoyaltyBadge tier={customer.loyaltyTier} />
      </div>

      {perks.length > 0 && (
        <p className="text-xs text-slate-300 mb-3">
          Perks to apply manually: <span className="text-amber-300">{perks.join(' · ')}</span>.
        </p>
      )}

      {usable.length === 0 ? (
        <p className="text-xs text-slate-400">No usable discount codes on this account.</p>
      ) : (
        <div className="space-y-2">
          {usable.map((c) => {
            const isApplied = c.code === appliedCode;
            return (
              <div key={c.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <span className="font-mono text-white">{c.code}</span>
                  <span className="text-slate-400"> · {c.percent}% {c.singleUse ? '(single-use)' : ''}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onApply(isApplied ? null : c.code, isApplied ? null : c.percent)}
                  className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-md border ${
                    isApplied
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-slate-700/40 border-slate-600 text-slate-200 hover:bg-slate-700/60'
                  }`}
                >
                  {isApplied ? <span className="inline-flex items-center gap-1"><Check size={12} /> Applied</span> : 'Apply'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {appliedCode && appliedPercent != null && orderAmount > 0 && (
        <p className="text-xs text-amber-200 mt-3">
          {appliedPercent}% off = −{money((orderAmount * appliedPercent) / 100)} on the current Order Amount.
          <span className="text-slate-400"> Adjust the Order Amount above to the discounted total — it's not changed automatically.</span>
        </p>
      )}
    </div>
  );
};

export default LoyaltyOrderPanel;
