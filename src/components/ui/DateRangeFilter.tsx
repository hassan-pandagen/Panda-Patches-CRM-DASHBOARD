// src/components/ui/DateRangeFilter.tsx
// SIMPLIFIED VERSION - Replace your current file with this

import React, { useState, useEffect } from 'react';

export interface DateRange {
  startDate: string;
  endDate: string;
}

interface DateRangeFilterProps {
  value?: DateRange;
  onChange: (range: DateRange) => void;
  label?: string;
  showLabels?: boolean;
}

export const getDefaultRange = (): DateRange => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 7);
  
  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  };
};

const DateRangeFilter: React.FC<DateRangeFilterProps> = ({ 
  value, 
  onChange,
  label,
  showLabels = true 
}) => {
  const defaultRange = getDefaultRange();
  const [startDate, setStartDate] = useState(value?.startDate || defaultRange.startDate);
  const [endDate, setEndDate] = useState(value?.endDate || defaultRange.endDate);
  const [hasChanges, setHasChanges] = useState(false);

  // Sync with parent value changes
  useEffect(() => {
    if (value && (value.startDate !== startDate || value.endDate !== endDate)) {
      setStartDate(value.startDate);
      setEndDate(value.endDate);
      setHasChanges(false);
    }
  }, [value]);

  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStartDate(e.target.value);
    setHasChanges(true);
  };

  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEndDate(e.target.value);
    setHasChanges(true);
  };

  const handleApply = () => {
    onChange({ startDate, endDate });
    setHasChanges(false);
  };

  return (
    <div className="flex flex-col gap-3">
      {label && (
        <h3 className="text-sm font-semibold text-slate-300">{label}</h3>
      )}
      
      <div className="flex flex-wrap items-end gap-3">
        {/* Start Date */}
        <div className="flex flex-col min-w-[150px]">
          {showLabels && (
            <label htmlFor="date-range-start" className="text-xs text-slate-400 mb-1.5 font-medium">
              Start Date
            </label>
          )}
          <input
            id="date-range-start"
            type="date"
            value={startDate}
            onChange={handleStartChange}
            max={endDate}
            className="px-4 py-2.5 bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-brand-orange transition-all cursor-pointer"
            style={{ 
              colorScheme: 'dark',
              WebkitAppearance: 'none',
              MozAppearance: 'none',
              appearance: 'none'
            }}
          />
        </div>

        {/* End Date */}
        <div className="flex flex-col min-w-[150px]">
          {showLabels && (
            <label htmlFor="date-range-end" className="text-xs text-slate-400 mb-1.5 font-medium">
              End Date
            </label>
          )}
          <input
            id="date-range-end"
            type="date"
            value={endDate}
            onChange={handleEndChange}
            min={startDate}
            className="px-4 py-2.5 bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-brand-orange transition-all cursor-pointer"
            style={{ 
              colorScheme: 'dark',
              WebkitAppearance: 'none',
              MozAppearance: 'none',
              appearance: 'none'
            }}
          />
        </div>

        {/* Apply Button - Always show for now to debug */}
        <button
          onClick={handleApply}
          disabled={!hasChanges}
          className={`px-6 py-2.5 rounded-xl text-white text-sm font-semibold transition-all whitespace-nowrap shadow-lg ${
            hasChanges 
              ? 'bg-gradient-to-r from-brand-orange to-orange-600 hover:from-orange-600 hover:to-brand-orange shadow-brand-orange/20 hover:shadow-brand-orange/40' 
              : 'bg-slate-700 opacity-50 cursor-not-allowed'
          }`}
        >
          Apply {hasChanges ? '✓' : ''}
        </button>
      </div>

      {/* Calendar Icon Styles */}
      <style>{`
        /* Make date inputs clickable everywhere */
        input[type="date"] {
          position: relative;
          color-scheme: dark;
          cursor: pointer;
        }

        /* Make calendar icon visible and clickable */
        input[type="date"]::-webkit-calendar-picker-indicator {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          width: auto;
          height: auto;
          color: transparent;
          background: transparent;
          filter: invert(1) brightness(1.2);
          cursor: pointer;
          transition: filter 0.2s ease;
        }

        input[type="date"]::-webkit-calendar-picker-indicator:hover {
          filter: invert(0.7) sepia(1) saturate(5) hue-rotate(0deg) brightness(1.2);
        }

        /* Firefox */
        input[type="date"]::-moz-calendar-picker-indicator {
          cursor: pointer;
        }

        /* Ensure the entire input is clickable */
        input[type="date"]::-webkit-inner-spin-button,
        input[type="date"]::-webkit-clear-button {
          display: none;
        }

        input[type="date"]::-webkit-datetime-edit {
          cursor: pointer;
        }
      `}</style>
    </div>
  );
};

export default DateRangeFilter;