// ShipByPill — soft visual reminder of an order's ship-by target date.
// Purely informational: neutral by default, amber as it nears, red if overdue and
// not yet shipped, muted-green once shipped. Independent of the urgent/rush workflow.
import React from 'react';
import { CalendarClock } from 'lucide-react';

// Statuses that mean the order has shipped (reminder no longer "at risk").
const SHIPPED_STATUSES = new Set(['SHIPPED', 'DELIVERED', 'FEEDBACK', 'COMPLETED']);

interface Props {
  shipByDate?: string | null;
  status?: string;
  className?: string;
}

const ShipByPill: React.FC<Props> = ({ shipByDate, status, className = '' }) => {
  if (!shipByDate) return null;
  const due = new Date(`${shipByDate}T00:00:00`);
  if (isNaN(due.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  const shipped = status ? SHIPPED_STATUSES.has(status) : false;
  const label = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  let tone = 'bg-slate-700/40 border-slate-600 text-slate-300'; // neutral / future
  let suffix = '';
  if (shipped) {
    tone = 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300';
  } else if (days < 0) {
    tone = 'bg-red-500/10 border-red-500/40 text-red-300';
    suffix = ` · ${Math.abs(days)}d overdue`;
  } else if (days <= 2) {
    tone = 'bg-amber-500/10 border-amber-500/40 text-amber-300';
    suffix = days === 0 ? ' · today' : ` · ${days}d`;
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${tone} ${className}`}
      title="Ship-by reminder — not an urgent flag"
    >
      <CalendarClock className="w-3 h-3" />
      Ship by {label}{suffix}
    </span>
  );
};

export default ShipByPill;
