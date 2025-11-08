// src/components/ui/DateRangeFilter.tsx

import React from 'react';

export interface DateRange {
  startDate: string;
  endDate: string;
}

interface DateRangeFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

export const getDefaultRange = (): DateRange => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 60);
  
  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  };
};

const DateRangeFilter: React.FC<DateRangeFilterProps> = ({ value, onChange }) => {
  const [startDate, setStartDate] = React.useState(value.startDate);
  const [endDate, setEndDate] = React.useState(value.endDate);
  const [hasChanges, setHasChanges] = React.useState(false);

  React.useEffect(() => {
    setStartDate(value.startDate);
    setEndDate(value.endDate);
    setHasChanges(false);
  }, [value.startDate, value.endDate]);

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
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
      <div className="flex items-center gap-2">
        <div className="flex flex-col">
          <label htmlFor="start-date" className="text-xs text-slate-400 mb-1">Start Date</label>
          <input
            id="start-date"
            type="date"
            value={startDate}
            onChange={handleStartChange}
            max={endDate}
            className="px-2 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
          />
        </div>
        <div className="flex flex-col">
          <label htmlFor="end-date" className="text-xs text-slate-400 mb-1">End Date</label>
          <input
            id="end-date"
            type="date"
            value={endDate}
            onChange={handleEndChange}
            min={startDate}
            className="px-2 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
          />
        </div>
      </div>
      {hasChanges && (
        <button
          onClick={handleApply}
          className="px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 transition-colors whitespace-nowrap self-end"
        >
          Apply
        </button>
      )}
    </div>
  );
};

DateRangeFilter.displayName = 'DateRangeFilter';

export default DateRangeFilter;