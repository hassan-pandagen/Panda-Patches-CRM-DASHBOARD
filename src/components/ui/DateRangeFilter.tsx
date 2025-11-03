import React, { useState, useCallback, useEffect } from 'react';

export interface DateRange {
  startDate: string | null;
  endDate: string | null;
}

interface DateRangeFilterProps {
  onChange: (range: DateRange) => void;
}

const DateRangeFilter: React.FC<DateRangeFilterProps> = ({ onChange }) => {
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: null,
    endDate: null,
  });

  // Debounce the onChange calls
  useEffect(() => {
    const timer = setTimeout(() => {
      onChange(dateRange);
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [dateRange, onChange]);

  const handleStartDateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value || null;
    setDateRange(prev => ({ ...prev, startDate: value }));
  }, []);

  const handleEndDateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value || null;
    setDateRange(prev => ({ ...prev, endDate: value }));
  }, []);

  return (
    <div className="flex gap-4 items-center">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Start Date
        </label>
        <input
          type="date"
          value={dateRange.startDate || ''}
          onChange={handleStartDateChange}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          End Date
        </label>
        <input
          type="date"
          value={dateRange.endDate || ''}
          onChange={handleEndDateChange}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>
    </div>
  );
};

export default DateRangeFilter;