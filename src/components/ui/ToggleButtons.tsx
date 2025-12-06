// src/components/ui/ToggleButtons.tsx
// Updated with Custom option

import React from 'react';

interface ToggleButtonsProps {
  view: 'today' | 'week' | 'month' | 'custom';
  onViewChange: (view: 'today' | 'week' | 'month' | 'custom') => void;
}

const ToggleButtons: React.FC<ToggleButtonsProps> = ({ view, onViewChange }) => {
  return (
    <div className="inline-flex rounded-xl bg-slate-900/40 backdrop-blur-xl border border-white/10 p-1">
      {['today', 'week', 'month'].map((option) => (
        <button
          key={option}
          onClick={() => onViewChange(option as 'today' | 'week' | 'month')}
          className={`relative px-6 py-2 rounded-lg font-semibold text-sm transition-all capitalize ${
            view === option
              ? 'bg-gradient-to-r from-brand-orange to-orange-600 text-white shadow-lg shadow-brand-orange/20'
              : 'text-slate-400 hover:text-brand-orange'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
};

export default ToggleButtons;