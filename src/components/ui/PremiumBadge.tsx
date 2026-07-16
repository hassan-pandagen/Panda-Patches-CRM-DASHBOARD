// src/components/ui/PremiumBadge.tsx
// "Premium customer" badge — amber/gold, distinct from every other badge color in the app
// (red = Urgent, emerald = Paid/Production Complete, blue = Repeat Order). Shown to sales AND
// production so production knows to apply extra QA/QC — but carries ONLY the tag itself, never
// a reason or dollar amount (production must never see financial/sales data).
import React from 'react';
import { Crown } from 'lucide-react';

interface PremiumBadgeProps {
  size?: 'sm' | 'md';
  title?: string;
}

const PremiumBadge: React.FC<PremiumBadgeProps> = ({ size = 'sm', title = 'Premium Customer' }) => {
  const isSmall = size === 'sm';
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border font-semibold bg-amber-400/15 border-amber-400/40 text-amber-300 ${
        isSmall ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'
      }`}
    >
      <Crown size={isSmall ? 10 : 12} />
      Premium
    </span>
  );
};

export default PremiumBadge;
