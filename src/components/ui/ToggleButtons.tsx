// src/components/ui/ToggleButtons.tsx
// Industry-standard date presets with month navigation

import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export type DateViewOption = 'today' | 'week' | 'month' | 'last-month' | 'quarter' | 'year' | 'custom';

interface ToggleButtonsProps {
  view: string;
  onViewChange: (view: DateViewOption) => void;
  /** When view is 'month' or 'custom', show which month is active */
  activeMonth?: string; // e.g. "2026-02"
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
}

const presets: { key: DateViewOption; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: '7 Days' },
  { key: 'month', label: 'This Month' },
  { key: 'last-month', label: 'Last Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year', label: 'Year' },
];

const ToggleButtons: React.FC<ToggleButtonsProps> = ({ view, onViewChange, activeMonth, onPrevMonth, onNextMonth }) => {
  // Format activeMonth for display
  const monthLabel = useMemo(() => {
    if (!activeMonth) return null;
    const [y, m] = activeMonth.split('-').map(Number);
    const d = new Date(y, m - 1);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }, [activeMonth]);

  return (
    <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
      {/* Preset buttons */}
      <div className="flex rounded-xl bg-slate-900/40 backdrop-blur-xl border border-white/10 p-1 overflow-x-auto no-scrollbar max-w-full">
        {presets.map((p) => (
          <button
            key={p.key}
            onClick={() => onViewChange(p.key)}
            className={`relative px-3 md:px-4 py-1.5 md:py-2 rounded-lg font-semibold text-xs md:text-sm transition-all whitespace-nowrap flex-shrink-0 ${
              view === p.key
                ? 'bg-gradient-to-r from-brand-orange to-orange-600 text-white shadow-lg shadow-brand-orange/20'
                : 'text-slate-400 hover:text-brand-orange'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Month navigation arrows — show when custom date is active */}
      {(view === 'custom' || view === 'last-month' || view === 'quarter' || view === 'year') && monthLabel && onPrevMonth && onNextMonth && (
        <div className="inline-flex items-center gap-1 rounded-xl bg-slate-900/40 backdrop-blur-xl border border-white/10 p-1">
          <button
            onClick={onPrevMonth}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-2 text-xs font-medium text-slate-300 whitespace-nowrap min-w-[70px] text-center">
            {monthLabel}
          </span>
          <button
            onClick={onNextMonth}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default ToggleButtons;
