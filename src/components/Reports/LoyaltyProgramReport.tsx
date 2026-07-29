// src/components/Reports/LoyaltyProgramReport.tsx
// CL86F1 Task 4 (+ MASTER v3 review metrics). Per-tier loyalty figures from the staff-gated
// loyalty_tier_stats() RPC, plus monthly review invitations from review_invitation_stats().
// Both RPCs hard-check the caller is ADMIN/SALES_AGENT, so non-staff get an error (empty).
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getLoyaltyTierStats, getReviewInvitationStats } from '../../services/loyaltyService';
import { Award, Star } from 'lucide-react';

const money = (n: number) => '$' + Math.round(n).toLocaleString();
const pct = (n: number) => `${Math.round(n * 100)}%`;
const TIER_LABEL: Record<string, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };

const Card: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">{icon}{title}</h3>
    {children}
  </div>
);

const LoyaltyProgramReport: React.FC = () => {
  const { data: tiers = [], isLoading: tiersLoading } = useQuery({
    queryKey: ['loyalty-tier-stats'],
    queryFn: getLoyaltyTierStats,
  });
  const { data: reviews = [] } = useQuery({
    queryKey: ['review-invitation-stats'],
    queryFn: getReviewInvitationStats,
  });

  return (
    <div className="space-y-6">
      <Card title="Loyalty Tiers" icon={<Award size={18} className="text-brand-orange" />}>
        {tiersLoading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/5 text-xs text-slate-400 uppercase tracking-wider">
                  <th className="py-2 pr-4">Tier</th>
                  <th className="py-2 px-4 text-right">Customers</th>
                  <th className="py-2 px-4 text-right">Lifetime Value</th>
                  <th className="py-2 px-4 text-right">Avg / Customer</th>
                  <th className="py-2 px-4 text-right">Active Codes</th>
                  <th className="py-2 px-4 text-right">Redeemed</th>
                  <th className="py-2 pl-4 text-right">Reorder Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-200">
                {tiers.map((t) => (
                  <tr key={t.tier}>
                    <td className="py-2.5 pr-4 font-semibold text-white">{TIER_LABEL[t.tier] ?? t.tier}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums">{t.customers.toLocaleString()}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums">{money(t.totalLifetimeValue)}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums">{money(t.avgLifetimeValue)}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums">{t.activeCodes.toLocaleString()}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums">{t.redeemedCodes.toLocaleString()}</td>
                    <td className="py-2.5 pl-4 text-right tabular-nums">{pct(t.reorderRate)}</td>
                  </tr>
                ))}
                {tiers.length === 0 && (
                  <tr><td colSpan={7} className="py-4 text-center text-slate-400">No tiered customers yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-slate-500 mt-3">
          Discount-cost and incremental code-user reorder lift need Trustpilot-style attribution — added when the Trustpilot API lands.
        </p>
      </Card>

      <Card title="Review Program" icon={<Star size={18} className="text-brand-orange" />}>
        {reviews.length === 0 ? (
          <p className="text-sm text-slate-400">No review invitations sent yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/5 text-xs text-slate-400 uppercase tracking-wider">
                  <th className="py-2 pr-4">Month</th>
                  <th className="py-2 px-4 text-right">Invitations Sent</th>
                  <th className="py-2 pl-4 text-right">Reminders Sent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-200">
                {reviews.map((r) => (
                  <tr key={r.month}>
                    <td className="py-2.5 pr-4 text-white">{r.month}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums">{r.invitesSent.toLocaleString()}</td>
                    <td className="py-2.5 pl-4 text-right tabular-nums">{r.remindersSent.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-slate-500 mt-3">
          Invitation→review rate + rating trend come from Trustpilot (upgrade path); these are the CRM-side send counts.
        </p>
      </Card>
    </div>
  );
};

export default LoyaltyProgramReport;
