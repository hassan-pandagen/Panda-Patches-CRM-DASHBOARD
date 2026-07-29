// src/components/ui/LoyaltyBadge.tsx
// Loyalty tier badge (CL86F1) — Bronze / Silver / Gold, shown next to the customer name
// beside the Premium chip. Tier-specific colors, distinct from Premium's amber-Crown.
// LoyaltyProgress renders the "$X to the next tier" bar. Both are staff-facing on the
// Customer detail page; they carry the tier + progress only.
import React from 'react';
import { Award, Medal, Trophy } from 'lucide-react';

export type LoyaltyTier = 'none' | 'bronze' | 'silver' | 'gold';

const TIERS: Record<Exclude<LoyaltyTier, 'none'>, { label: string; cls: string; Icon: typeof Award }> = {
  bronze: { label: 'Bronze', cls: 'bg-orange-900/30 border-orange-700/50 text-orange-300', Icon: Award },
  silver: { label: 'Silver', cls: 'bg-slate-400/15 border-slate-300/40 text-slate-200', Icon: Medal },
  gold:   { label: 'Gold',   cls: 'bg-yellow-400/15 border-yellow-400/50 text-yellow-300', Icon: Trophy },
};

// Threshold (lifetime paid value) at which each tier is reached.
export const TIER_THRESHOLDS = { bronze: 1000, silver: 5000, gold: 10000 } as const;

interface LoyaltyBadgeProps {
  tier: LoyaltyTier;
  size?: 'sm' | 'md';
}

const LoyaltyBadge: React.FC<LoyaltyBadgeProps> = ({ tier, size = 'sm' }) => {
  if (tier === 'none') return null;
  const { label, cls, Icon } = TIERS[tier];
  const isSmall = size === 'sm';
  return (
    <span
      title={`${label} loyalty member`}
      className={`inline-flex items-center gap-1 rounded-full border font-semibold ${cls} ${
        isSmall ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'
      }`}
    >
      <Icon size={isSmall ? 10 : 12} />
      {label}
    </span>
  );
};

// Progress toward the next tier. Gold shows a "top tier" state with no bar.
export const LoyaltyProgress: React.FC<{ tier: LoyaltyTier; lifetimePaidValue: number }> = ({
  tier,
  lifetimePaidValue,
}) => {
  const money = (n: number) => '$' + Math.round(n).toLocaleString();

  if (tier === 'gold') {
    return (
      <div className="mt-3 text-xs text-yellow-300/90">
        🏆 Gold — top tier · lifetime {money(lifetimePaidValue)}
      </div>
    );
  }

  // Current band's floor and the next threshold.
  const floor = tier === 'silver' ? TIER_THRESHOLDS.silver
              : tier === 'bronze' ? TIER_THRESHOLDS.bronze
              : 0;
  const nextThreshold = tier === 'silver' ? TIER_THRESHOLDS.gold
                      : tier === 'bronze' ? TIER_THRESHOLDS.silver
                      : TIER_THRESHOLDS.bronze;
  const nextLabel = tier === 'silver' ? 'Gold' : tier === 'bronze' ? 'Silver' : 'Bronze';

  const toNext = Math.max(0, nextThreshold - lifetimePaidValue);
  const pct = Math.min(100, Math.max(0, ((lifetimePaidValue - floor) / (nextThreshold - floor)) * 100));

  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs text-slate-300 mb-1">
        <span>{money(lifetimePaidValue)}</span>
        <span className="text-slate-400">{money(toNext)} to {nextLabel}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-700/50 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-orange to-yellow-400 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

export default LoyaltyBadge;
