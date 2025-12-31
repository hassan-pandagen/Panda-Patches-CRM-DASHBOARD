// src/pages/ClockInOutPage.tsx - INDUSTRY STANDARD ATTENDANCE TRACKING
// Pakistan timezone (PKT) with Denver (MST) business hours alignment

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  LogIn,
  LogOut,
  Clock,
  Calendar,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Users,
  Download,
  AlertTriangle,
  Timer,
  CalendarDays,
  FileSpreadsheet,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  format, 
  parseISO, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth,
  endOfMonth,
  differenceInMinutes,
  addHours,
} from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { 
  useClockInOut, 
  SHIFT_CONFIG,
  calculateWorkDate,
  determineStatus,
  generateDailyReport,
  generateWeeklyReport,
  generateMonthlyReport,
  getWorkingDaysInRange,
  getPakistanTime,
  DailyReport,
  WeeklyReport,
  MonthlyReport,
} from '../hooks/useClockInOut';
import DateRangeFilter, { DateRange, getDefaultRange } from '../components/ui/DateRangeFilter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { queryKeys } from '../constants/queryKeys';
import SpotlightCard from '../components/ui/SpotlightCard';
import StatusBadge from '../components/ui/StatusBadge';
import { debounce } from '../utils/debounce';

// ============================================
// ANIMATION VARIANTS
// ============================================
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.1 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 100, damping: 15 },
  },
};

// ============================================
// HELPER COMPONENTS
// ============================================
// StatusBadge is now imported from '../components/ui/StatusBadge' for better performance

const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtext?: string;
  color?: string;
}> = ({ icon, label, value, subtext, color = 'text-white' }) => (
  <div className="bg-slate-800/30 rounded-xl p-4 border border-white/5">
    <div className="flex items-center gap-2 mb-2">
      {icon}
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
    </div>
    <p className={`text-2xl font-bold ${color}`}>{value}</p>
    {subtext && <p className="text-xs text-slate-500 mt-1">{subtext}</p>}
  </div>
);

// ============================================
// MAIN COMPONENT
// ============================================
const ClockInOutPage: React.FC = () => {
  const { user, role, permissions } = useAuth();
  const queryClient = useQueryClient();

  // State
  const [dateRange, setDateRange] = useState<DateRange>(() => getDefaultRange());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [adminTab, setAdminTab] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedWeekStart, setSelectedWeekStart] = useState(() => {
    const today = new Date();
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    return weekStart.toISOString().split('T')[0];
  });

  // Clock In/Out Hook
  const {
    todaySessions,
    activeSession,
    isClockedIn,
    isLoadingToday,
    totalHoursToday,
    timeRemainingHours,
    currentSessionHours,
    autoClockOutWarning,
    todayStatus,
    clockIn,
    isClockingIn,
    clockOut,
    isClockingOut,
    clockInError,
    clockOutError,
  } = useClockInOut();

  const error = clockInError?.message || clockOutError?.message;

  // Admin data fetching
  const { data: allAttendance = [], isLoading: isLoadingAll } = useQuery({
    queryKey: queryKeys.attendance.list({ dateRange, selectedUser }),
    queryFn: async () => {
      let query = supabase
        .from('attendance_sessions')
        .select('*')
        .gte('work_date', dateRange.startDate)
        .lte('work_date', dateRange.endDate)
        .order('work_date', { ascending: false })
        .order('clock_in_time', { ascending: false });

      if (selectedUser) {
        query = query.eq('user_email', selectedUser);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: role === 'ADMIN',
  });

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Permissions check
  const isAdmin = role === 'ADMIN' && !permissions?.attendance_clock_only;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // ============================================
  // COMPUTED VALUES
  // ============================================
  
  const pktTime = getPakistanTime(currentTime);
  const workDate = calculateWorkDate(currentTime);

  // Unique users for filter
  const uniqueUsers = useMemo(() => {
    const seen = new Set<string>();
    const users: Array<{ email: string; name: string }> = [];
    allAttendance.forEach((record) => {
      if (!seen.has(record.user_email)) {
        seen.add(record.user_email);
        users.push({ email: record.user_email, name: record.user_name });
      }
    });
    return users.sort((a, b) => a.name.localeCompare(b.name));
  }, [allAttendance]);

  // Auto clock-out countdown
  const autoClockOutTime = useMemo(() => {
    if (!activeSession) return null;
    const clockIn = new Date(activeSession.clock_in_time);
    return addHours(clockIn, SHIFT_CONFIG.MAX_SHIFT_HOURS);
  }, [activeSession]);

  const minutesUntilAutoClockOut = useMemo(() => {
    if (!autoClockOutTime) return null;
    return Math.max(0, differenceInMinutes(autoClockOutTime, currentTime));
  }, [autoClockOutTime, currentTime]);

  // ============================================
  // HANDLERS - OPTIMIZED WITH DEBOUNCING
  // ============================================

  // Debounced clock in handler (100ms) to prevent multiple rapid clicks
  const handleClockIn = useCallback(
    debounce(async () => {
      await clockIn();
      queryClient.invalidateQueries({ queryKey: queryKeys.attendance.all() });
    }, 100),
    [clockIn, queryClient]
  );

  // Debounced clock out handler (100ms) to prevent multiple rapid clicks
  const handleClockOut = useCallback(
    debounce(async () => {
      await clockOut();
      queryClient.invalidateQueries({ queryKey: queryKeys.attendance.all() });
    }, 100),
    [clockOut, queryClient]
  );

  const filterToday = useCallback(() => {
    const today = calculateWorkDate(new Date());
    setDateRange({ startDate: today, endDate: today });
  }, []);

  const filterThisWeek = useCallback(() => {
    const today = new Date();
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
    setDateRange({
      startDate: weekStart.toISOString().split('T')[0],
      endDate: weekEnd.toISOString().split('T')[0],
    });
  }, []);

  const filterThisMonth = useCallback(() => {
    const today = new Date();
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);
    setDateRange({
      startDate: monthStart.toISOString().split('T')[0],
      endDate: monthEnd.toISOString().split('T')[0],
    });
  }, []);

  // ============================================
  // EXPORT FUNCTIONS
  // ============================================

  const escapeCSV = (value: any) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const downloadCSV = (data: any[], filename: string) => {
    if (!data || data.length === 0) return;
    const firstRow = data[0];
    if (!firstRow) return;
    
    const headers = Object.keys(firstRow).map(escapeCSV).join(',');
    const rows = data.map(row => Object.values(row).map(escapeCSV).join(','));
    const csv = [headers, ...rows].join('\n');
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExportDaily = () => {
    const exportData = allAttendance.map((record) => {
      const hours = record.clock_out_time 
        ? record.duration_hours 
        : (new Date().getTime() - new Date(record.clock_in_time).getTime()) / (60 * 60 * 1000);
      
      const status = determineStatus(hours, !record.clock_out_time);

      return {
        'Employee Name': record.user_name,
        'Email': record.user_email,
        'Work Date': format(parseISO(record.work_date), 'MMM dd, yyyy'),
        'Day': format(parseISO(record.work_date), 'EEEE'),
        'Clock In (PKT)': format(parseISO(record.clock_in_time), 'h:mm:ss a'),
        'Clock Out (PKT)': record.clock_out_time ? format(parseISO(record.clock_out_time), 'h:mm:ss a') : '—',
        'Hours Worked': hours.toFixed(2),
        'Overtime Hours': hours > SHIFT_CONFIG.OVERTIME_THRESHOLD ? (hours - SHIFT_CONFIG.REQUIRED_HOURS).toFixed(2) : '0.00',
        'Undertime Hours': hours < SHIFT_CONFIG.UNDERTIME_THRESHOLD && hours > 0 ? (SHIFT_CONFIG.REQUIRED_HOURS - hours).toFixed(2) : '0.00',
        'Status': status,
        'Auto Clock-Out': record.auto_clocked_out ? 'Yes' : 'No',
      };
    });

    downloadCSV(exportData, `attendance-daily-${format(new Date(), 'yyyy-MM-dd')}.csv`);
  };

  const handleExportWeekly = () => {
    const weekEnd = new Date(selectedWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().split('T')[0];
    
    // Filter records for the selected week
    const weekRecords = allAttendance.filter(r => 
      r.work_date >= selectedWeekStart && r.work_date <= weekEndStr
    );
    
    const reports = generateWeeklyReport(weekRecords, uniqueUsers, selectedWeekStart, weekEndStr);
    
    const exportData = reports.map(r => ({
      'Employee Name': r.employee,
      'Email': r.email,
      'Week': `${format(parseISO(r.weekStart), 'MMM dd')} - ${format(parseISO(r.weekEnd), 'MMM dd, yyyy')}`,
      'Days Worked': r.totalDays,
      'Total Hours': r.totalHours.toFixed(2),
      'Overtime Hours': r.overtimeHours.toFixed(2),
      'Undertime Hours': r.undertimeHours.toFixed(2),
      'Absent Days': r.absentDays,
      'Avg Hours/Day': r.avgHoursPerDay.toFixed(2),
    }));

    downloadCSV(exportData, `attendance-weekly-${selectedWeekStart}.csv`);
  };

  const handleExportMonthly = () => {
    const monthRecords = allAttendance.filter(r => r.work_date.startsWith(selectedMonth));
    const reports = generateMonthlyReport(monthRecords, uniqueUsers, selectedMonth);
    
    const exportData = reports.map(r => ({
      'Employee Name': r.employee,
      'Email': r.email,
      'Month': format(parseISO(`${r.month}-01`), 'MMMM yyyy'),
      'Days Worked': r.totalDays,
      'Completed Days': r.completedDays,
      'Total Hours': r.totalHours.toFixed(2),
      'Overtime Hours': r.overtimeHours.toFixed(2),
      'Undertime Hours': r.undertimeHours.toFixed(2),
      'Absent Days': r.absentDays,
      'Avg Hours/Day': r.avgHoursPerDay.toFixed(2),
    }));

    downloadCSV(exportData, `attendance-monthly-${selectedMonth}.csv`);
  };

  const handleForceClockOut = async (recordId: string, userEmail: string) => {
    if (!confirm(`Force clock out for ${userEmail}? This will clock them out at the current time.`)) return;
    
    try {
      const record = allAttendance.find(r => r.id === recordId);
      if (!record) return;
      
      const clockOutTime = new Date().toISOString();
      let hoursWorked = (new Date(clockOutTime).getTime() - new Date(record.clock_in_time).getTime()) / (60 * 60 * 1000);
      
      // Cap at max hours
      hoursWorked = Math.min(hoursWorked, SHIFT_CONFIG.MAX_SHIFT_HOURS);
      
      const { error } = await supabase
        .from('attendance_sessions')
        .update({ 
          clock_out_time: clockOutTime,
          duration_hours: hoursWorked,
          auto_clocked_out: true,
        })
        .eq('id', recordId);
      
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: queryKeys.attendance.all() });
      alert(`Successfully clocked out ${userEmail}. Hours: ${hoursWorked.toFixed(2)}`);
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="relative min-h-screen">
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-brand-orange/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 space-y-6 p-6 lg:p-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
        >
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-white mb-2 flex items-center gap-3">
              <Clock className="w-8 h-8 text-brand-orange" />
              Attendance Tracking
            </h1>
            <p className="text-slate-400 text-sm">
              Pakistan Time (PKT) • Work Date: <span className="text-white font-semibold">{format(parseISO(workDate), 'EEEE, MMM dd, yyyy')}</span>
            </p>
          </div>

          {/* Time Display */}
          <div className="text-right">
            <p className="text-4xl lg:text-5xl font-bold text-brand-orange font-mono">
              {format(currentTime, 'h:mm:ss a')}
            </p>
            <p className="text-slate-400 text-sm">
              {format(currentTime, 'EEEE, MMM dd, yyyy')} (PKT)
            </p>
          </div>
        </motion.div>

        {/* Error Alert */}
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}

        {/* Auto Clock-Out Warning */}
        {autoClockOutWarning && minutesUntilAutoClockOut !== null && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-yellow-400 flex-shrink-0" />
              <div>
                <p className="text-yellow-400 font-semibold">Auto Clock-Out Warning!</p>
                <p className="text-yellow-400/80 text-sm">
                  You will be automatically clocked out in <span className="font-bold">{minutesUntilAutoClockOut} minutes</span> 
                  {' '}(at {format(autoClockOutTime!, 'h:mm a')}). Please clock out manually if you're done working.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Active Session Banner */}
        {activeSession && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-5 bg-blue-500/10 border border-blue-500/30 rounded-xl"
          >
            <div className="flex items-start gap-4">
              <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse mt-1.5" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-blue-400 mb-2">
                  Active Session
                </h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-slate-400">Work Date:</span>
                    <p className="text-white font-semibold">{format(parseISO(activeSession.work_date), 'MMM dd, yyyy')}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Clocked In:</span>
                    <p className="text-white font-semibold">{format(parseISO(activeSession.clock_in_time), 'h:mm:ss a')}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Hours Active:</span>
                    <p className="text-white font-semibold">{currentSessionHours.toFixed(2)}h</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Auto Clock-Out:</span>
                    <p className="text-white font-semibold">{autoClockOutTime ? format(autoClockOutTime, 'h:mm a') : '—'}</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Main Clock Section */}
        <motion.div
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 lg:grid-cols-3 gap-6"
        >
          {/* Clock In/Out Card */}
          <div className="lg:col-span-2">
            <SpotlightCard className="p-6 lg:p-8">
              {/* Status */}
              <div className="text-center mb-6">
                <p className="text-slate-400 mb-2 text-sm uppercase tracking-wide">Current Status</p>
                <div className="flex items-center justify-center gap-3">
                  <div className={`w-4 h-4 rounded-full ${isClockedIn ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                  <p className="text-2xl lg:text-3xl font-bold text-white">
                    {isClockedIn ? 'CLOCKED IN' : 'CLOCKED OUT'}
                  </p>
                </div>
              </div>

              {/* Session History */}
              {todaySessions.length > 0 && (
                <div className="mb-6 bg-slate-800/30 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Today's Sessions</p>
                  {todaySessions.map((session, idx) => (
                    <div key={session.id} className="flex justify-between items-center text-sm py-2 border-b border-slate-700/50 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 text-xs">#{idx + 1}</span>
                        <span className="text-slate-300">
                          {format(parseISO(session.clock_in_time), 'h:mm a')}
                          <ChevronRight className="w-3 h-3 inline mx-1 text-slate-500" />
                          {session.clock_out_time ? format(parseISO(session.clock_out_time), 'h:mm a') : 
                            <span className="text-blue-400">Active</span>}
                        </span>
                      </div>
                      <span className="text-white font-mono font-semibold">
                        {session.clock_out_time 
                          ? `${session.duration_hours?.toFixed(2) || '0.00'}h`
                          : `${currentSessionHours.toFixed(2)}h`}
                      </span>
                    </div>
                  ))}
                  
                  {/* Totals */}
                  <div className="pt-3 border-t border-slate-700 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-semibold">Total Hours:</span>
                      <span className="text-brand-orange font-bold text-xl">{totalHoursToday.toFixed(2)}h</span>
                    </div>
                    {isClockedIn && timeRemainingHours > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Remaining for 8h:</span>
                        <span className="text-blue-400 font-semibold">{timeRemainingHours.toFixed(2)}h</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Status:</span>
                      <StatusBadge status={todayStatus} />
                    </div>
                  </div>
                </div>
              )}

              {/* Progress Bar */}
              <div className="mb-6">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-400">Progress</span>
                  <span className="text-white font-semibold">{totalHoursToday.toFixed(1)}h / {SHIFT_CONFIG.REQUIRED_HOURS}h</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      totalHoursToday >= SHIFT_CONFIG.OVERTIME_THRESHOLD
                        ? 'bg-gradient-to-r from-purple-500 to-purple-600'
                        : totalHoursToday >= SHIFT_CONFIG.REQUIRED_HOURS
                        ? 'bg-gradient-to-r from-emerald-500 to-emerald-600'
                        : 'bg-gradient-to-r from-brand-orange to-orange-600'
                    }`}
                    style={{ width: `${Math.min((totalHoursToday / SHIFT_CONFIG.REQUIRED_HOURS) * 100, 125)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>0h</span>
                  <span className="text-orange-400">{SHIFT_CONFIG.UNDERTIME_THRESHOLD}h</span>
                  <span className="text-emerald-400">{SHIFT_CONFIG.REQUIRED_HOURS}h</span>
                  <span className="text-purple-400">{SHIFT_CONFIG.OVERTIME_THRESHOLD}h+</span>
                </div>
              </div>

              {/* Clock Buttons */}
              <div className="flex gap-4">
                <button
                  onClick={handleClockIn}
                  disabled={isClockedIn || isClockingIn}
                  className={`flex-1 py-4 px-6 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 ${
                    isClockedIn
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:shadow-lg hover:shadow-emerald-500/20 hover:scale-[1.02]'
                  }`}
                >
                  {isClockingIn ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <LogIn className="w-5 h-5" />
                  )}
                  Clock In
                </button>

                <button
                  onClick={handleClockOut}
                  disabled={!isClockedIn || isClockingOut}
                  className={`flex-1 py-4 px-6 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 ${
                    !isClockedIn
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-red-500 to-rose-500 text-white hover:shadow-lg hover:shadow-red-500/20 hover:scale-[1.02]'
                  }`}
                >
                  {isClockingOut ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <LogOut className="w-5 h-5" />
                  )}
                  Clock Out
                </button>
              </div>
            </SpotlightCard>
          </div>

          {/* Info Cards */}
          <div className="space-y-4">
            {/* Shift Info */}
            <SpotlightCard className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <Timer className="w-5 h-5 text-brand-orange" />
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Shift Rules</h3>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Required:</span>
                  <span className="text-white font-semibold">{SHIFT_CONFIG.REQUIRED_HOURS}h</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Overtime after:</span>
                  <span className="text-purple-400 font-semibold">{SHIFT_CONFIG.OVERTIME_THRESHOLD}h</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Undertime below:</span>
                  <span className="text-orange-400 font-semibold">{SHIFT_CONFIG.UNDERTIME_THRESHOLD}h</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Auto clock-out:</span>
                  <span className="text-yellow-400 font-semibold">{SHIFT_CONFIG.MAX_SHIFT_HOURS}h</span>
                </div>
                <div className="pt-2 border-t border-slate-700">
                  <p className="text-xs text-slate-500">
                    Day cutoff: {SHIFT_CONFIG.SHIFT_CUTOFF_HOUR}:00 AM PKT
                  </p>
                </div>
              </div>
            </SpotlightCard>

            {/* Quick Stats */}
            <SpotlightCard className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <TrendingUp className="w-5 h-5 text-purple-400" />
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Today</h3>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Status:</span>
                  <StatusBadge status={todayStatus} size="sm" />
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Sessions:</span>
                  <span className="text-white font-semibold">{todaySessions.length}</span>
                </div>
                {totalHoursToday >= SHIFT_CONFIG.OVERTIME_THRESHOLD && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Overtime:</span>
                    <span className="text-purple-400 font-semibold">
                      +{(totalHoursToday - SHIFT_CONFIG.REQUIRED_HOURS).toFixed(2)}h
                    </span>
                  </div>
                )}
              </div>
            </SpotlightCard>
          </div>
        </motion.div>

        {/* Admin Section */}
        {isAdmin && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            {/* Tab Navigation */}
            <div className="flex gap-2 border-b border-white/10 pb-2">
              {[
                { key: 'daily', label: 'Daily Records', icon: Calendar },
                { key: 'weekly', label: 'Weekly Report', icon: CalendarDays },
                { key: 'monthly', label: 'Monthly Report', icon: FileSpreadsheet },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setAdminTab(key as any)}
                  className={`px-4 py-2.5 font-semibold transition-all rounded-lg flex items-center gap-2 ${
                    adminTab === key
                      ? 'text-brand-orange bg-brand-orange/10'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>

            {/* Daily Records Tab */}
            {adminTab === 'daily' && (
              <div className="space-y-4">
                {/* Filters */}
                <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-xl p-4 space-y-4">
                  {/* Quick Filters */}
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={filterToday} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors">
                      Today
                    </button>
                    <button onClick={filterThisWeek} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg transition-colors">
                      This Week
                    </button>
                    <button onClick={filterThisMonth} className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg transition-colors">
                      This Month
                    </button>
                  </div>

                  {/* Date Range & User Filter */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2">
                      <DateRangeFilter value={dateRange} onChange={setDateRange} />
                    </div>
                    <select
                      value={selectedUser}
                      onChange={(e) => setSelectedUser(e.target.value)}
                      className="px-4 py-2.5 bg-slate-900/40 border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-orange"
                    >
                      <option value="">All Employees</option>
                      {uniqueUsers.map((u) => (
                        <option key={u.email} value={u.email}>{u.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Export Button */}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">
                      {allAttendance.length} records found
                    </span>
                    <button
                      onClick={handleExportDaily}
                      disabled={allAttendance.length === 0}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-lg font-semibold transition-all disabled:opacity-50"
                    >
                      <Download className="w-4 h-4" />
                      Export Daily CSV
                    </button>
                  </div>
                </div>

                {/* Table */}
                <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-900/50 border-b border-slate-800">
                          <th className="text-left text-slate-400 font-semibold p-4 text-sm">Employee</th>
                          <th className="text-left text-slate-400 font-semibold p-4 text-sm">Date</th>
                          <th className="text-left text-slate-400 font-semibold p-4 text-sm">Clock In</th>
                          <th className="text-left text-slate-400 font-semibold p-4 text-sm">Clock Out</th>
                          <th className="text-left text-slate-400 font-semibold p-4 text-sm">Hours</th>
                          <th className="text-left text-slate-400 font-semibold p-4 text-sm">Status</th>
                          <th className="text-left text-slate-400 font-semibold p-4 text-sm">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allAttendance.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="text-center py-12 text-slate-500">
                              <Calendar className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                              <p>No attendance records found</p>
                            </td>
                          </tr>
                        ) : (
                          allAttendance.map((record) => {
                            const hours = record.clock_out_time 
                              ? record.duration_hours || 0
                              : (Date.now() - new Date(record.clock_in_time).getTime()) / (60 * 60 * 1000);
                            const status = determineStatus(hours, !record.clock_out_time);
                            
                            return (
                              <tr key={record.id} className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
                                <td className="p-4">
                                  <p className="text-white font-medium">{record.user_name}</p>
                                  <p className="text-xs text-slate-500">{record.user_email}</p>
                                </td>
                                <td className="p-4">
                                  <p className="text-white">{format(parseISO(record.work_date), 'MMM dd, yyyy')}</p>
                                  <p className="text-xs text-slate-500">{format(parseISO(record.work_date), 'EEEE')}</p>
                                </td>
                                <td className="p-4 text-white">{format(parseISO(record.clock_in_time), 'h:mm:ss a')}</td>
                                <td className="p-4 text-white">
                                  {record.clock_out_time ? format(parseISO(record.clock_out_time), 'h:mm:ss a') : '—'}
                                  {record.auto_clocked_out && (
                                    <span className="ml-2 text-xs text-yellow-400">(Auto)</span>
                                  )}
                                </td>
                                <td className="p-4">
                                  <p className="text-white font-semibold">{hours.toFixed(2)}h</p>
                                </td>
                                <td className="p-4">
                                  <StatusBadge status={status} size="sm" />
                                </td>
                                <td className="p-4">
                                  {!record.clock_out_time && (
                                    <button
                                      onClick={() => handleForceClockOut(record.id, record.user_email)}
                                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors"
                                    >
                                      Force Out
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Weekly Report Tab */}
            {adminTab === 'weekly' && (
              <div className="space-y-4">
                <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-xl p-4">
                  <div className="flex flex-wrap gap-4 items-center justify-between">
                    <div className="flex items-center gap-4">
                      <label className="text-slate-400 text-sm">Week Starting:</label>
                      <input
                        type="date"
                        value={selectedWeekStart}
                        onChange={(e) => {
                          setSelectedWeekStart(e.target.value);
                          // Also update date range for query
                          const weekEnd = new Date(e.target.value);
                          weekEnd.setDate(weekEnd.getDate() + 6);
                          setDateRange({
                            startDate: e.target.value,
                            endDate: weekEnd.toISOString().split('T')[0],
                          });
                        }}
                        className="px-4 py-2 bg-slate-900/40 border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-orange"
                      />
                    </div>
                    <button
                      onClick={handleExportWeekly}
                      disabled={uniqueUsers.length === 0}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-lg font-semibold transition-all disabled:opacity-50"
                    >
                      <Download className="w-4 h-4" />
                      Export Weekly CSV
                    </button>
                  </div>
                </div>

                {/* Weekly Summary Table */}
                <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-900/50 border-b border-slate-800">
                          <th className="text-left text-slate-400 font-semibold p-4 text-sm">Employee</th>
                          <th className="text-center text-slate-400 font-semibold p-4 text-sm">Days</th>
                          <th className="text-center text-slate-400 font-semibold p-4 text-sm">Total Hours</th>
                          <th className="text-center text-slate-400 font-semibold p-4 text-sm">Overtime</th>
                          <th className="text-center text-slate-400 font-semibold p-4 text-sm">Undertime</th>
                          <th className="text-center text-slate-400 font-semibold p-4 text-sm">Absent</th>
                          <th className="text-center text-slate-400 font-semibold p-4 text-sm">Avg/Day</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const weekEnd = new Date(selectedWeekStart);
                          weekEnd.setDate(weekEnd.getDate() + 6);
                          const reports = generateWeeklyReport(
                            allAttendance, 
                            uniqueUsers, 
                            selectedWeekStart, 
                            weekEnd.toISOString().split('T')[0]
                          );
                          
                          if (reports.length === 0) {
                            return (
                              <tr>
                                <td colSpan={7} className="text-center py-12 text-slate-500">
                                  <CalendarDays className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                                  <p>No data for this week</p>
                                </td>
                              </tr>
                            );
                          }
                          
                          return reports.map((stat) => (
                            <tr key={stat.email} className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
                              <td className="p-4">
                                <p className="text-white font-medium">{stat.employee}</p>
                                <p className="text-xs text-slate-500">{stat.email}</p>
                              </td>
                              <td className="p-4 text-center text-white font-bold">{stat.totalDays}</td>
                              <td className="p-4 text-center text-white font-bold">{stat.totalHours.toFixed(1)}h</td>
                              <td className="p-4 text-center">
                                <span className={stat.overtimeHours > 0 ? 'text-purple-400 font-bold' : 'text-slate-500'}>
                                  {stat.overtimeHours.toFixed(1)}h
                                </span>
                              </td>
                              <td className="p-4 text-center">
                                <span className={stat.undertimeHours > 0 ? 'text-orange-400 font-bold' : 'text-slate-500'}>
                                  {stat.undertimeHours.toFixed(1)}h
                                </span>
                              </td>
                              <td className="p-4 text-center">
                                <span className={stat.absentDays > 0 ? 'text-red-400 font-bold' : 'text-slate-500'}>
                                  {stat.absentDays}
                                </span>
                              </td>
                              <td className="p-4 text-center text-slate-300">{stat.avgHoursPerDay.toFixed(1)}h</td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Monthly Report Tab */}
            {adminTab === 'monthly' && (
              <div className="space-y-4">
                <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-xl p-4">
                  <div className="flex flex-wrap gap-4 items-center justify-between">
                    <div className="flex items-center gap-4">
                      <label className="text-slate-400 text-sm">Month:</label>
                      <input
                        type="month"
                        value={selectedMonth}
                        onChange={(e) => {
                          setSelectedMonth(e.target.value);
                          // Update date range for query
                          const [year, month] = e.target.value.split('-').map(Number);
                          const firstDay = new Date(year, month - 1, 1);
                          const lastDay = new Date(year, month, 0);
                          setDateRange({
                            startDate: firstDay.toISOString().split('T')[0],
                            endDate: lastDay.toISOString().split('T')[0],
                          });
                        }}
                        className="px-4 py-2 bg-slate-900/40 border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-orange"
                      />
                    </div>
                    <button
                      onClick={handleExportMonthly}
                      disabled={uniqueUsers.length === 0}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-brand-orange to-orange-600 hover:from-orange-600 hover:to-brand-orange text-white rounded-lg font-semibold transition-all disabled:opacity-50"
                    >
                      <Download className="w-4 h-4" />
                      Export Monthly CSV
                    </button>
                  </div>
                </div>

                {/* Monthly Summary Table */}
                <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-900/50 border-b border-slate-800">
                          <th className="text-left text-slate-400 font-semibold p-4 text-sm">Employee</th>
                          <th className="text-center text-slate-400 font-semibold p-4 text-sm">Days Worked</th>
                          <th className="text-center text-slate-400 font-semibold p-4 text-sm">Completed</th>
                          <th className="text-center text-slate-400 font-semibold p-4 text-sm">Total Hours</th>
                          <th className="text-center text-slate-400 font-semibold p-4 text-sm">Overtime</th>
                          <th className="text-center text-slate-400 font-semibold p-4 text-sm">Undertime</th>
                          <th className="text-center text-slate-400 font-semibold p-4 text-sm">Absent</th>
                          <th className="text-center text-slate-400 font-semibold p-4 text-sm">Avg/Day</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const reports = generateMonthlyReport(allAttendance, uniqueUsers, selectedMonth);
                          
                          if (reports.length === 0) {
                            return (
                              <tr>
                                <td colSpan={8} className="text-center py-12 text-slate-500">
                                  <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                                  <p>No data for {format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy')}</p>
                                </td>
                              </tr>
                            );
                          }
                          
                          return reports.map((stat) => (
                            <tr key={stat.email} className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
                              <td className="p-4">
                                <p className="text-white font-medium">{stat.employee}</p>
                                <p className="text-xs text-slate-500">{stat.email}</p>
                              </td>
                              <td className="p-4 text-center text-white font-bold">{stat.totalDays}</td>
                              <td className="p-4 text-center">
                                <span className="text-emerald-400 font-bold">{stat.completedDays}</span>
                              </td>
                              <td className="p-4 text-center text-white font-bold">{stat.totalHours.toFixed(1)}h</td>
                              <td className="p-4 text-center">
                                <span className={stat.overtimeHours > 0 ? 'text-purple-400 font-bold' : 'text-slate-500'}>
                                  {stat.overtimeHours.toFixed(1)}h
                                </span>
                              </td>
                              <td className="p-4 text-center">
                                <span className={stat.undertimeHours > 0 ? 'text-orange-400 font-bold' : 'text-slate-500'}>
                                  {stat.undertimeHours.toFixed(1)}h
                                </span>
                              </td>
                              <td className="p-4 text-center">
                                <span className={stat.absentDays > 0 ? 'text-red-400 font-bold' : 'text-slate-500'}>
                                  {stat.absentDays}
                                </span>
                              </td>
                              <td className="p-4 text-center text-slate-300">{stat.avgHoursPerDay.toFixed(1)}h</td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default ClockInOutPage;
