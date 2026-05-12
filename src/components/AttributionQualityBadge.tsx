// AttributionQualityBadge — visual indicator of how good an order's Meta CAPI signal is.
// Drives agent behavior: 🔴 Untracked = "should have used Inbox flow", 🟢 Tracked = "did it right".
//
// Reads orders.attribution_quality (generated column) so it's always in sync with the JSONB.

import React from 'react';
import { Shield, ShieldAlert, ShieldOff } from 'lucide-react';

export type AttributionQuality = 'tracked' | 'partial' | 'untracked';

interface Props {
  quality: AttributionQuality | string | null | undefined;
  size?: 'sm' | 'md';
  showLabel?: boolean;
}

export function getAttributionQualityFromOrder(order: {
  attribution?: Record<string, any> | null;
  attribution_quality?: string | null;
  attributionQuality?: string | null;
}): AttributionQuality {
  // Prefer the DB-computed value
  const dbVal = order.attribution_quality ?? order.attributionQuality;
  if (dbVal === 'tracked' || dbVal === 'partial' || dbVal === 'untracked') return dbVal;
  // Fallback compute from attribution JSONB
  const attr = order.attribution ?? {};
  if (!attr || Object.keys(attr).length === 0) return 'untracked';
  if (attr.fbc || attr.fbp || attr.gclid || attr.ctwa_clid) return 'tracked';
  if (attr.utm_source) return 'partial';
  return 'untracked';
}

const META: Record<AttributionQuality, {
  label: string;
  Icon: typeof Shield;
  classes: string;
  tooltip: string;
}> = {
  tracked: {
    label: 'Tracked',
    Icon: Shield,
    classes: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    tooltip: 'Order has Meta fbc/fbp — CAPI will fire with full ad attribution (high EMQ).',
  },
  partial: {
    label: 'Partial',
    Icon: ShieldAlert,
    classes: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    tooltip: 'Order has UTM tags but no Meta click ID — medium-quality attribution.',
  },
  untracked: {
    label: 'Untracked',
    Icon: ShieldOff,
    classes: 'bg-red-500/15 text-red-300 border-red-500/30',
    tooltip: 'Order has no ad attribution — Meta CAPI fires as system_generated (low EMQ). If customer came from Facebook/Instagram, use Inbox → Convert to Quote flow next time.',
  },
};

const AttributionQualityBadge: React.FC<Props> = ({ quality, size = 'md', showLabel = true }) => {
  const q: AttributionQuality =
    (quality === 'tracked' || quality === 'partial' || quality === 'untracked')
      ? quality
      : 'untracked';
  const { label, Icon, classes, tooltip } = META[q];
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';
  const padding = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-0.5';
  const text = size === 'sm' ? 'text-[10px]' : 'text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1 ${padding} rounded-full ${text} font-medium border ${classes}`}
      title={tooltip}
    >
      <Icon className={iconSize} />
      {showLabel && label}
    </span>
  );
};

export default AttributionQualityBadge;
