// src/components/ui/ToggleButtons.tsx
// Updated with Today option

import React from 'react';
import { motion } from 'framer-motion';

interface ToggleButtonsProps {
  view: 'today' | 'week' | 'month';
  onViewChange: (view: 'today' | 'week' | 'month') => void;
}

const ToggleButtons: React.FC<ToggleButtonsProps> = ({ view, onViewChange }) => {
  return (
    <div className="inline-flex rounded-xl bg-slate-900/40 backdrop-blur-xl border border-white/10 p-1">
      {['today', 'week', 'month'].map((option) => (
        <button
          key={option}
          onClick={() => onViewChange(option as 'today' | 'week' | 'month')}
          className="relative px-6 py-2 rounded-lg font-semibold text-sm transition-all capitalize"
        >
          {/* Active background */}
          {view === option && (
            <motion.div
              layoutId="activeTab"
              className="absolute inset-0 bg-gradient-to-r from-brand-orange to-orange-600 rounded-lg"
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          )}
          
          {/* Text */}
          <span
            className={`relative z-10 transition-colors ${
              view === option
                ? 'text-white'
                : 'text-slate-400 hover:text-brand-orange'
            }`}
          >
            {option}
          </span>
        </button>
      ))}
    </div>
  );
};

export default ToggleButtons;