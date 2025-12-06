// src/pages/ClockInOutPage.tsx - CLOCK IN/OUT ATTENDANCE
import React, { useState, useEffect, useMemo, FC } from 'react';
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
  Upload,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO, startOfWeek, endOfWeek, startOfDay, endOfDay } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { useClockInOut } from '../hooks/useClockInOut';
import DateRangeFilter, { DateRange, getDefaultRange } from '../components/ui/DateRangeFilter';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { queryKeys } from '../constants/queryKeys';

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

const ClockInOutPage: React.FC = () => {
  const { user, role, permissions } = useAuth();

  const [dateRange, setDateRange] = useState<DateRange>(() => getDefaultRange());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'clock' | 'admin'>('clock');
  const [showMonthly, setShowMonthly] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().slice(0, 7) // YYYY-MM
  );

  // --- NEW: Refactored hook usage ---
  const {
    todayAttendance,
    isLoadingToday,
    clockIn,
    isClockingIn,
    clockOut,
    isClockingOut,
    clockInError,
    clockOutError,
    SHIFT_CONFIG,
  } = useClockInOut();

  const isLoading = isLoadingToday || isClockingIn || isClockingOut;
  const error = clockInError?.message || clockOutError?.message;

  // --- NEW: Admin-specific data fetching ---
  const { data: allAttendance = [], isLoading: isLoadingAll } = useQuery({
    queryKey: queryKeys.attendance.all(dateRange, selectedUser),
    queryFn: async () => {
      let query = supabase
        .from('attendance_logs')
        .select('*')
        .gte('work_date', dateRange.startDate)
        .lte('work_date', dateRange.endDate)
        .order('work_date', { ascending: false });

      if (selectedUser) {
        query = query.eq('user_email', selectedUser);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: role === 'ADMIN', // Only admins can fetch all records
  });

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Check if user is admin and NOT a clock-only user
  const isAdmin = role === 'ADMIN' && !permissions?.attendance_clock_only;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Calculate current shift time remaining
  const getTimeRemaining = (): string => {
    if (!todayAttendance?.clock_in_time) return 'N/A';

    const clockInTime = new Date(todayAttendance.clock_in_time);
    const requiredMs = SHIFT_CONFIG.REQUIRED_HOURS * 60 * 60 * 1000;
    const elapsed = currentTime.getTime() - clockInTime.getTime();
    const remaining = Math.max(0, requiredMs - elapsed);

    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

    return `${hours}h ${minutes}m`;
  };

  // Calculate hours worked
  const getHoursWorked = (): number => {
    if (!todayAttendance?.clock_in_time) return 0;

    const clockInTime = new Date(todayAttendance.clock_in_time);
    const endTime = todayAttendance.clock_out_time
      ? new Date(todayAttendance.clock_out_time)
      : currentTime;

    return (endTime.getTime() - clockInTime.getTime()) / (60 * 60 * 1000);
  };

  const hoursWorked = getHoursWorked();
  const isClockedIn = !!todayAttendance?.clock_in_time && !todayAttendance?.clock_out_time;

  // ✅ FIX: Calculate unique users directly in the component using useMemo
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

  const monthlyStats = useMemo(() => {
    if (!showMonthly) return [];

    const monthData = allAttendance.filter(r => r.work_date.startsWith(selectedMonth));
    const userStats = new Map<string, any>();

    monthData.forEach((record) => {
      if (!userStats.has(record.user_email)) {
        userStats.set(record.user_email, {
          name: record.user_name,
          email: record.user_email,
          totalDays: 0,
          totalHours: 0,
          overtimeHours: 0,
          undertimeHours: 0,
          incompleteDays: 0,
        });
      }
      const stats = userStats.get(record.user_email);
      stats.totalDays += 1;
      stats.totalHours += record.shift_hours;

      // ✅ Map old "LATE" status to correct status (24/7 operation)
      let correctedStatus = record.status;
      if (record.status === 'LATE') {
        if (record.shift_hours === 0) correctedStatus = 'INCOMPLETE';
        else if (record.shift_hours >= SHIFT_CONFIG.OVERTIME_THRESHOLD) correctedStatus = 'OVERTIME';
        else if (record.shift_hours < SHIFT_CONFIG.UNDERTIME_THRESHOLD) correctedStatus = 'UNDERTIME';
        else correctedStatus = 'COMPLETED';
      }

      if (correctedStatus === 'INCOMPLETE') stats.incompleteDays += 1;
      if (correctedStatus === 'OVERTIME') {
        stats.overtimeHours += Math.max(0, record.shift_hours - SHIFT_CONFIG.REQUIRED_HOURS);
      }
      if (correctedStatus === 'UNDERTIME') {
        stats.undertimeHours += Math.max(0, SHIFT_CONFIG.REQUIRED_HOURS - record.shift_hours);
      }
    });
    return Array.from(userStats.values());
  }, [allAttendance, showMonthly, selectedMonth, SHIFT_CONFIG.REQUIRED_HOURS]);

  // ✅ NEW: Quick filter functions
  const filterToday = () => {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    setDateRange({
      startDate: dateStr,
      endDate: dateStr,
    });
  };

  const filterThisWeek = () => {
    const today = new Date();
    const weekStart = startOfWeek(today, { weekStartsOn: 1 }); // Monday
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
    setDateRange({
      startDate: weekStart.toISOString().split('T')[0],
      endDate: weekEnd.toISOString().split('T')[0],
    });
  };

  // ✅ NEW: Export daily records to CSV (12-hour format with AM/PM)
  const handleExportDaily = () => {
    const exportData = allAttendance.map((record) => {
      // Map old "LATE" status to correct status based on hours (24/7 no late tracking)
      let correctedStatus = record.status;
      if (record.status === 'LATE') {
        if (record.shift_hours === 0) correctedStatus = 'INCOMPLETE';
        else if (record.shift_hours >= SHIFT_CONFIG.OVERTIME_THRESHOLD) correctedStatus = 'OVERTIME';
        else if (record.shift_hours < SHIFT_CONFIG.UNDERTIME_THRESHOLD) correctedStatus = 'UNDERTIME';
        else correctedStatus = 'COMPLETED';
      }

      return {
        'Employee Name': record.user_name,
        'Email': record.user_email,
        'Date': format(parseISO(record.work_date), 'MMM dd, yyyy'),
        'Clock In': format(parseISO(record.clock_in_time), 'h:mm:ss a'), // 12-hour with AM/PM
        'Clock Out': record.clock_out_time ? format(parseISO(record.clock_out_time), 'h:mm:ss a') : '—',
        'Hours Worked': record.shift_hours.toFixed(2),
        'Status': correctedStatus,
      };
    });

    if (!exportData || exportData.length === 0) return;
    
    // ✅ DAY 3 FIX: Add array bounds check
    const firstRow = exportData[0];
    if (!firstRow) return;
    
    const headers = Object.keys(firstRow).join(',');
    const rows = exportData.map(row => Object.values(row).join(','));
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-daily-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleForceClockOut = async (recordId: string, userEmail: string) => {
    if (!confirm(`Force clock out for ${userEmail}?`)) return;
    
    try {
      const record = allAttendance.find(r => r.id === recordId);
      if (!record) return;
      
      const clockOutTime = new Date().toISOString();
      const hoursWorked = (new Date(clockOutTime).getTime() - new Date(record.clock_in_time).getTime()) / (60 * 60 * 1000);
      
      const { error } = await supabase
        .from('attendance_logs')
        .update({ 
          clock_out_time: clockOutTime,
          shift_hours: hoursWorked
        })
        .eq('id', recordId);
      
      if (error) throw error;
      
      // Refetch data
      const queryKey = queryKeys.attendance.all(dateRange, selectedUser);
      queryClient.invalidateQueries({ queryKey });
      
      alert(`Forced clock out for ${userEmail}`);
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  const handleExportMonthly = () => {
    const exportData = monthlyStats.map((stat) => ({
      'Employee Name': stat.name,
      'Email': stat.email,
      'Days Worked': stat.totalDays,
      'Total Hours': stat.totalHours.toFixed(2),
      'Overtime Hours': stat.overtimeHours.toFixed(2),
      'Undertime Hours': stat.undertimeHours.toFixed(2),
      'Absent/Incomplete': stat.incompleteDays,
    }));

    if (!exportData || exportData.length === 0) return;
    
    // ✅ DAY 3 FIX: Add array bounds check
    const firstRow = exportData[0];
    if (!firstRow) return;
    
    const headers = Object.keys(firstRow).join(',');
    const rows = exportData.map(row => Object.values(row).join(','));
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-report-${selectedMonth}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="relative min-h-screen">
      {/* Background Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-brand-orange/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 space-y-8 p-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
        >
          <div>
            <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
              <Clock className="w-8 h-8 text-brand-orange" />
              Attendance Tracking
            </h1>
            <p className="text-slate-400">
              Available 24/7 - Clock in/out anytime
            </p>
          </div>

          {/* Current Time Display */}
          <div className="text-right">
            <p className="text-5xl font-bold text-brand-orange font-mono">
              {format(currentTime, 'h:mm:ss a')}
            </p>
            <p className="text-slate-400 text-sm">
              {format(currentTime, 'EEE, MMM dd, yyyy')}
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
            <AlertCircle className="w-5 h-5" />
            {error}
          </motion.div>
        )}

        {/* CLOCK IN/OUT SECTION */}
        <motion.div
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 lg:grid-cols-3 gap-6"
        >
          {/* Main Clock Button */}
          <div className="lg:col-span-2">
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-orange to-orange-600 rounded-2xl opacity-0 group-hover:opacity-50 blur transition duration-500" />

              <div className="relative bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-8 text-center">
                <div className="mb-6">
                  <p className="text-slate-400 mb-2">Current Status</p>
                  <p className="text-3xl font-bold text-white">
                    {isClockedIn ? '🟢 CLOCKED IN' : '⚫ CLOCKED OUT'}
                  </p>
                </div>

                {todayAttendance?.clock_in_time && (
                  <div className="space-y-3 mb-8 bg-slate-800/30 rounded-xl p-4">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Clock In Time:</span>
                      <span className="text-white font-semibold">
                        {format(parseISO(todayAttendance.clock_in_time), 'h:mm:ss a')}
                      </span>
                    </div>
                    {todayAttendance.clock_out_time && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Clock Out Time:</span>
                        <span className="text-white font-semibold">
                          {format(parseISO(todayAttendance.clock_out_time), 'h:mm:ss a')}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Hours Worked:</span>
                      <span className="text-brand-orange font-bold text-lg">
                        {hoursWorked.toFixed(2)}h
                      </span>
                    </div>
                    {isClockedIn && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Time Remaining:</span>
                        <span className="text-blue-400 font-bold">
                          {getTimeRemaining()}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-4">
                  <button
                    onClick={clockIn}
                    disabled={isClockedIn || isLoading}
                    className={`flex-1 py-4 px-6 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 ${
                      isClockedIn
                        ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:shadow-lg hover:shadow-emerald-500/20'
                    }`}
                  >
                    <LogIn className="w-5 h-5" />
                    Clock In
                  </button>

                  <button
                    onClick={clockOut}
                    disabled={!isClockedIn || isLoading}
                    className={`flex-1 py-4 px-6 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 ${
                      !isClockedIn
                        ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-red-500 to-rose-500 text-white hover:shadow-lg hover:shadow-red-500/20'
                    }`}
                  >
                    <LogOut className="w-5 h-5" />
                    Clock Out
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Status Cards */}
          <div className="space-y-4">
            {/* Today Status */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl opacity-0 group-hover:opacity-30 blur transition duration-500" />
              <div className="relative bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <CheckCircle className="w-5 h-5 text-blue-400" />
                  <h3 className="text-sm font-semibold text-slate-400 uppercase">Status</h3>
                </div>
                <p className="text-2xl font-bold text-white mb-2">
                  {todayAttendance?.status || 'No Data'}
                </p>
                <p className="text-xs text-slate-500">
                  {todayAttendance
                    ? `Updated: ${format(parseISO(todayAttendance.updated_at), 'HH:mm')}`
                    : 'Not started'}
                </p>
              </div>
            </div>

            {/* Time Display */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl opacity-0 group-hover:opacity-30 blur transition duration-500" />
              <div className="relative bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <TrendingUp className="w-5 h-5 text-purple-400" />
                  <h3 className="text-sm font-semibold text-slate-400 uppercase">Hours</h3>
                </div>
                <p className="text-2xl font-bold text-white">
                  {hoursWorked.toFixed(1)}h / {SHIFT_CONFIG.REQUIRED_HOURS}h
                </p>
                <div className="w-full bg-slate-700 rounded-full h-2 mt-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-brand-orange to-orange-600 h-full transition-all"
                    style={{
                      width: `${Math.min((hoursWorked / SHIFT_CONFIG.REQUIRED_HOURS) * 100, 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ADMIN SECTION */}
        {isAdmin && (
          <div className="space-y-4">
            {/* Tabs */}
            <div className="flex gap-2 border-b border-white/10">
              <button
                onClick={() => setActiveTab('clock')}
                className={`px-4 py-3 font-semibold transition-all ${
                  activeTab === 'clock'
                    ? 'text-brand-orange border-b-2 border-brand-orange'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-4 h-4 inline mr-2" />
                Daily Records
              </button>

              <button
                onClick={() => setActiveTab('admin')}
                className={`px-4 py-3 font-semibold transition-all ${
                  activeTab === 'admin'
                    ? 'text-brand-orange border-b-2 border-brand-orange'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Download className="w-4 h-4 inline mr-2" />
                Monthly Report
              </button>
            </div>

            {/* Daily Records Tab */}
            {activeTab === 'clock' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="relative group"
              >
                <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl opacity-0 group-hover:opacity-30 blur transition duration-500" />

                <div className="relative bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
                   {/* Quick Filter Buttons */}
                   <div className="p-6 border-b border-white/10 space-y-4">
                     <div className="flex gap-2 flex-wrap">
                       <button
                         onClick={filterToday}
                         className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
                       >
                         Today
                       </button>
                       <button
                         onClick={filterThisWeek}
                         className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg transition-colors"
                       >
                         This Week
                       </button>
                     </div>

                     {/* Filters */}
                     <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                       <div className="lg:col-span-2">
                         <DateRangeFilter value={dateRange} onChange={setDateRange} />
                       </div>

                       <select
                         value={selectedUser}
                         onChange={(e) => setSelectedUser(e.target.value)}
                         className="px-4 py-2.5 bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-orange transition-all"
                       >
                         <option value="">All Employees</option>
                         {uniqueUsers.map((u) => (
                           <option key={u.email} value={u.email}>
                             {u.name} ({u.email})
                           </option>
                         ))}
                       </select>
                     </div>

                     {/* Export Button */}
                     <div className="flex justify-end">
                       <button
                         onClick={handleExportDaily}
                         disabled={allAttendance.length === 0}
                         className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                       >
                         <Download className="w-4 h-4" />
                         Export to CSV
                       </button>
                     </div>
                     </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-900/50 border-b border-slate-800">
                          <th className="text-left text-slate-400 font-semibold p-4 text-sm">
                            Employee
                          </th>
                          <th className="text-left text-slate-400 font-semibold p-4 text-sm">
                            Date
                          </th>
                          <th className="text-left text-slate-400 font-semibold p-4 text-sm">
                            Clock In
                          </th>
                          <th className="text-left text-slate-400 font-semibold p-4 text-sm">
                            Clock Out
                          </th>
                          <th className="text-left text-slate-400 font-semibold p-4 text-sm">
                            Hours
                          </th>
                          <th className="text-left text-slate-400 font-semibold p-4 text-sm">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <AnimatePresence>
                          {allAttendance.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="text-center py-12 text-slate-500">
                                <Calendar className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                                <p>No attendance records found</p>
                              </td>
                            </tr>
                          ) : (
                            allAttendance.map((record, index) => (
                              <motion.tr
                                key={record.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ delay: index * 0.02 }}
                                className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors"
                              >
                                <td className="p-4">
                                  <div>
                                    <p className="text-white font-medium">{record.user_name}</p>
                                    <p className="text-xs text-slate-500">{record.user_email}</p>
                                  </div>
                                </td>

                                <td className="p-4">
                                  <p className="text-white font-medium">
                                    {format(parseISO(record.work_date), 'MMM dd, yyyy')}
                                  </p>
                                </td>

                                <td className="p-4">
                                   <p className="text-white">
                                     {format(parseISO(record.clock_in_time), 'h:mm:ss a')}
                                   </p>
                                 </td>

                                 <td className="p-4">
                                   <p className="text-white">
                                     {record.clock_out_time
                                       ? format(parseISO(record.clock_out_time), 'h:mm:ss a')
                                       : '—'}
                                   </p>
                                 </td>

                                <td className="p-4">
                                  <p className="text-white font-semibold">
                                    {(() => {
                                      const hours = record.clock_out_time 
                                        ? record.shift_hours
                                        : (new Date().getTime() - new Date(record.clock_in_time).getTime()) / (60 * 60 * 1000);
                                      
                                      if (hours < 1) {
                                        const minutes = Math.round(hours * 60);
                                        return `${minutes}m`;
                                      }
                                      return `${hours.toFixed(2)}h`;
                                    })()}
                                  </p>
                                </td>

                                <td className="p-4 flex items-center gap-2">
                                  <div>
                                    {(() => {
                                      // Map old "LATE" status to correct status
                                      let correctedStatus = record.status;
                                      if (record.status === 'LATE') {
                                        if (record.shift_hours === 0) correctedStatus = 'INCOMPLETE';
                                        else if (record.shift_hours >= SHIFT_CONFIG.OVERTIME_THRESHOLD) correctedStatus = 'OVERTIME';
                                        else if (record.shift_hours < SHIFT_CONFIG.UNDERTIME_THRESHOLD) correctedStatus = 'UNDERTIME';
                                        else correctedStatus = 'COMPLETED';
                                      }
                                      return <StatusBadge status={correctedStatus} />;
                                    })()}
                                  </div>
                                  {!record.clock_out_time && (
                                    <button
                                      onClick={() => handleForceClockOut(record.id, record.user_email)}
                                      className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded transition-colors whitespace-nowrap"
                                    >
                                      Force Out
                                    </button>
                                  )}
                                </td>
                              </motion.tr>
                            ))
                          )}
                        </AnimatePresence>
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Monthly Report Tab */}
            {activeTab === 'admin' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                {/* Month Selector & Export */}
                <div className="flex gap-4 items-center">
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="px-4 py-2.5 bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-orange transition-all"
                  />

                  <button
                    onClick={handleExportMonthly}
                    disabled={monthlyStats.length === 0}
                    className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-brand-orange to-orange-600 hover:from-orange-600 hover:to-brand-orange text-white rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Download className="w-4 h-4" />
                    Export Report
                  </button>
                </div>

                {/* Monthly Summary Table */}
                <div className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl opacity-0 group-hover:opacity-30 blur transition duration-500" />

                  <div className="relative bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-slate-900/50 border-b border-slate-800">
                            <th className="text-left text-slate-400 font-semibold p-4 text-sm">
                              Employee
                            </th>
                            <th className="text-center text-slate-400 font-semibold p-4 text-sm">
                              Days Worked
                            </th>
                            <th className="text-center text-slate-400 font-semibold p-4 text-sm">
                              Total Hours
                            </th>
                            <th className="text-center text-slate-400 font-semibold p-4 text-sm">
                              Overtime
                            </th>
                            <th className="text-center text-slate-400 font-semibold p-4 text-sm">
                              Undertime
                            </th>
                            <th className="text-center text-slate-400 font-semibold p-4 text-sm">
                              Absent
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <AnimatePresence>
                            {monthlyStats.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="text-center py-12 text-slate-500">
                                  <Calendar className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                                  <p>No data for {selectedMonth}</p>
                                </td>
                              </tr>
                            ) : (
                              monthlyStats.map((stat, index) => (
                                <motion.tr
                                  key={stat.email}
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ delay: index * 0.02 }}
                                  className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors"
                                >
                                  <td className="p-4">
                                    <div>
                                      <p className="text-white font-medium">{stat.name}</p>
                                      <p className="text-xs text-slate-500">{stat.email}</p>
                                    </div>
                                  </td>

                                  <td className="p-4 text-center">
                                    <p className="text-white font-bold">{stat.totalDays}</p>
                                  </td>

                                  <td className="p-4 text-center">
                                    <p className="text-white font-bold">
                                      {stat.totalHours.toFixed(1)}h
                                    </p>
                                  </td>

                                  <td className="p-4 text-center">
                                    <p
                                      className={`font-bold ${
                                        stat.overtimeHours > 0 ? 'text-emerald-400' : 'text-slate-400'
                                      }`}
                                    >
                                      {stat.overtimeHours.toFixed(1)}h
                                    </p>
                                  </td>

                                  <td className="p-4 text-center">
                                    <p
                                      className={`font-bold ${
                                        stat.undertimeHours > 0 ? 'text-orange-400' : 'text-slate-400'
                                      }`}
                                    >
                                      {stat.undertimeHours.toFixed(1)}h
                                    </p>
                                  </td>

                                  <td className="p-4 text-center">
                                    <p
                                      className={`font-bold ${
                                        stat.incompleteDays > 0 ? 'text-yellow-400' : 'text-slate-400'
                                      }`}
                                    >
                                      {stat.incompleteDays}
                                    </p>
                                  </td>
                                </motion.tr>
                              ))
                            )}
                          </AnimatePresence>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// STATUS BADGE COMPONENT
// ============================================================================
const StatusBadge: FC<{ status: string }> = ({ status }) => {
  const getColors = (status: string) => {
    switch (status) {
      case 'ON_TIME':
        return 'bg-emerald-500/20 text-emerald-400';
      case 'COMPLETED':
        return 'bg-emerald-500/20 text-emerald-400';
      case 'LATE':
        return 'bg-red-500/20 text-red-400';
      case 'OVERTIME':
        return 'bg-purple-500/20 text-purple-400';
      case 'UNDERTIME':
        return 'bg-orange-500/20 text-orange-400';
      case 'INCOMPLETE':
        return 'bg-yellow-500/20 text-yellow-400';
      default:
        return 'bg-slate-500/20 text-slate-400';
    }
  };

  return (
    <span className={`px-3 py-1.5 rounded-lg text-xs font-bold ${getColors(status)}`}>
      {status}
    </span>
  );
};

export default ClockInOutPage;
