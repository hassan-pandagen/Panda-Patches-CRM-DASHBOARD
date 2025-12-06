// src/components/ui/DateRangeFilter.tsx

import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  isBefore,
  isAfter,
  isWithinInterval,
} from 'date-fns';

export interface DateRange {
  startDate: string;
  endDate: string;
}

interface DateRangeFilterProps {
  value?: DateRange;
  onChange: (range: DateRange) => void;
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

const DateRangeFilter: React.FC<DateRangeFilterProps> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Sync with parent value changes only when calendar is closed
  useEffect(() => {
    if (!isOpen && value) {
      setCurrentMonth(new Date(value.startDate));
    }
  }, [value, isOpen]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleDateClick = (date: Date) => {
    if (!startDate || (startDate && endDate)) {
      // Start new selection
      setStartDate(date);
      setEndDate(null);
    } else {
      // Complete selection
      if (isBefore(date, startDate)) {
        setEndDate(startDate);
        setStartDate(date);
      } else {
        setEndDate(date);
      }
    }
  };

  const handleApply = () => {
    if (startDate && endDate) {
      onChange({
        startDate: format(startDate, 'yyyy-MM-dd'),
        endDate: format(endDate, 'yyyy-MM-dd'),
      });
      setIsOpen(false);
    }
  };

  const handleCancel = () => {
    // Reset to clean state
    setStartDate(null);
    setEndDate(null);
    setHoverDate(null);
    setCurrentMonth(new Date());
    setIsOpen(false);
  };

  const handleOpen = () => {
    // Clear selection when opening
    setStartDate(null);
    setEndDate(null);
    setHoverDate(null);
    setCurrentMonth(value ? new Date(value.startDate) : new Date());
    setIsOpen(true);
  };

  const getDaysInMonth = (date: Date) => {
    const start = startOfWeek(startOfMonth(date));
    const end = endOfWeek(endOfMonth(date));
    const days: Date[] = [];
    let currentDate = start;

    while (currentDate <= end) {
      days.push(currentDate);
      currentDate = addDays(currentDate, 1);
    }

    return days;
  };

  const isInRange = (date: Date) => {
    if (!startDate) return false;
    
    const rangeEnd = hoverDate && !endDate ? hoverDate : endDate;
    if (!rangeEnd) return false;

    const [start, end] = isBefore(startDate, rangeEnd) 
      ? [startDate, rangeEnd] 
      : [rangeEnd, startDate];

    return isWithinInterval(date, { start, end });
  };

  const isRangeStart = (date: Date) => {
    return startDate && isSameDay(date, startDate);
  };

  const isRangeEnd = (date: Date) => {
    return endDate && isSameDay(date, endDate);
  };

  const isDisabled = (date: Date) => {
    return isAfter(date, new Date());
  };

  const renderMonth = (monthDate: Date) => {
    const days = getDaysInMonth(monthDate);
    const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

    return (
      <div className="min-w-[280px]">
        {/* Month Header */}
        <div className="flex items-center justify-between mb-4 px-2">
          {monthDate.getTime() === currentMonth.getTime() && (
            <button
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-1.5 hover:bg-slate-700/50 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-slate-300" />
            </button>
          )}
          {monthDate.getTime() !== currentMonth.getTime() && (
            <div className="w-7" />
          )}
          <div className="flex-1 text-center">
            <span className="text-white font-bold text-base">
              {format(monthDate, 'MMMM yyyy')}
            </span>
          </div>
          {monthDate.getTime() === addMonths(currentMonth, 1).getTime() && (
            <button
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-1.5 hover:bg-slate-700/50 rounded-lg transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </button>
          )}
          {monthDate.getTime() !== addMonths(currentMonth, 1).getTime() && (
            <div className="w-7" />
          )}
        </div>

        {/* Week Days */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {weekDays.map((day) => (
            <div
              key={day}
              className="h-9 flex items-center justify-center text-slate-400 text-xs font-semibold"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, idx) => {
            const isCurrentMonth = isSameMonth(day, monthDate);
            const isSelected = isRangeStart(day) || isRangeEnd(day);
            const inRange = isInRange(day);
            const disabled = isDisabled(day);
            const todayDate = isToday(day);
            const rangeStart = isRangeStart(day);
            const rangeEnd = isRangeEnd(day);

            return (
              <button
                key={idx}
                onClick={() => !disabled && handleDateClick(day)}
                onMouseEnter={() => !disabled && setHoverDate(day)}
                onMouseLeave={() => setHoverDate(null)}
                disabled={disabled}
                className={`
                  h-9 w-9 flex items-center justify-center text-sm font-medium transition-all relative
                  ${!isCurrentMonth ? 'text-slate-600 opacity-40' : 'text-slate-200'}
                  ${disabled ? 'text-slate-600 cursor-not-allowed opacity-30' : 'cursor-pointer'}
                  ${isSelected ? 'bg-orange-600 text-white font-bold shadow-lg shadow-orange-600/30 z-10 scale-105' : ''}
                  ${inRange && !isSelected ? 'bg-orange-600/20 text-slate-100' : ''}
                  ${!disabled && !isSelected && !inRange && isCurrentMonth ? 'hover:bg-slate-700 hover:scale-105' : ''}
                  ${todayDate && !isSelected ? 'ring-2 ring-orange-500 ring-inset font-bold' : ''}
                  ${rangeStart && rangeEnd ? 'rounded-lg' : ''}
                  ${rangeStart && !rangeEnd ? 'rounded-l-lg rounded-r-none' : ''}
                  ${rangeEnd && !rangeStart ? 'rounded-r-lg rounded-l-none' : ''}
                  ${!rangeStart && !rangeEnd ? 'rounded-lg' : ''}
                `}
              >
                {format(day, 'd')}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const displayText =
    value?.startDate && value?.endDate
      ? `${format(new Date(value.startDate), 'MM/dd/yyyy')} - ${format(new Date(value.endDate), 'MM/dd/yyyy')}`
      : 'Select Date Range';

  return (
    <div className="relative" ref={popoverRef}>
      {/* Trigger Button */}
      <button
        onClick={handleOpen}
        className="flex items-center gap-2 px-4 py-2.5 bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-xl text-white text-sm hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-slate-500 transition-all"
      >
        <Calendar className="w-4 h-4 text-slate-400" />
        <span className="hidden sm:inline text-xs font-medium">{displayText}</span>
      </button>

      {/* Calendar Popover */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full right-0 mt-2 z-50 bg-slate-950 border border-white/10 rounded-2xl shadow-2xl p-6"
          >
            <div className="space-y-4">
              {/* Calendar */}
              <div className="flex gap-8 bg-slate-900/60 rounded-xl p-6 backdrop-blur-sm">
                {renderMonth(currentMonth)}
                {renderMonth(addMonths(currentMonth, 1))}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleCancel}
                  className="flex-1 px-5 py-2.5 text-sm font-medium text-slate-300 bg-slate-800/50 hover:bg-slate-800 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <motion.button
                  onClick={handleApply}
                  disabled={!startDate || !endDate}
                  whileHover={{ scale: startDate && endDate ? 1.02 : 1 }}
                  whileTap={{ scale: startDate && endDate ? 0.98 : 1 }}
                  className={`flex-1 px-5 py-2.5 text-sm font-bold rounded-xl transition-all ${
                    startDate && endDate
                      ? 'bg-gradient-to-r from-orange-600 to-orange-500 text-white hover:shadow-lg hover:shadow-orange-600/30'
                      : 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  Apply Range
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DateRangeFilter;