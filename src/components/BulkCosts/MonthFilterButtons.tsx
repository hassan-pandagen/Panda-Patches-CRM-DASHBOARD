// src/components/BulkCosts/MonthFilterButtons.tsx

import React from 'react';
import { motion } from 'framer-motion';
import { Calendar } from 'lucide-react';

interface MonthFilterButtonsProps {
  selectedYear: number;
  selectedMonth: number; // 1-12
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
}

const MONTHS = [
  { value: 1, label: 'Jan', full: 'January' },
  { value: 2, label: 'Feb', full: 'February' },
  { value: 3, label: 'Mar', full: 'March' },
  { value: 4, label: 'Apr', full: 'April' },
  { value: 5, label: 'May', full: 'May' },
  { value: 6, label: 'Jun', full: 'June' },
  { value: 7, label: 'Jul', full: 'July' },
  { value: 8, label: 'Aug', full: 'August' },
  { value: 9, label: 'Sep', full: 'September' },
  { value: 10, label: 'Oct', full: 'October' },
  { value: 11, label: 'Nov', full: 'November' },
  { value: 12, label: 'Dec', full: 'December' },
];

const MonthFilterButtons: React.FC<MonthFilterButtonsProps> = ({
  selectedYear,
  selectedMonth,
  onYearChange,
  onMonthChange,
}) => {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-4 mb-6">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        {/* Year Selector */}
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-brand-orange" />
          <select
            value={selectedYear}
            onChange={(e) => onYearChange(Number(e.target.value))}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange transition-all"
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        {/* Month Buttons */}
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {MONTHS.map((month) => (
              <motion.button
                key={month.value}
                onClick={() => onMonthChange(month.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  selectedMonth === month.value
                    ? 'bg-brand-orange text-white shadow-lg shadow-brand-orange/20'
                    : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title={month.full}
              >
                {month.label}
              </motion.button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MonthFilterButtons;
