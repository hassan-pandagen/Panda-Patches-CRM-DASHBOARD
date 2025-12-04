// src/hooks/useClockInOut.ts
import { useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface AttendanceRecord {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  work_date: string;
  clock_in_time: string;
  clock_out_time: string | null;
  shift_hours: number;
  status: 'ON_TIME' | 'LATE' | 'INCOMPLETE' | 'COMPLETED' | 'UNDERTIME' | 'OVERTIME';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const SHIFT_CONFIG = {
  SHIFT_START: '19:00', // 7:00 PM PKT
  SHIFT_END: '05:00',   // 5:00 AM PKT (next day)
  REQUIRED_HOURS: 8,
  LATE_THRESHOLD: 60,
  OVERTIME_THRESHOLD: 8.5,
  UNDERTIME_THRESHOLD: 7.5,
};

export const useClockInOut = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const getTodayDate = useCallback((): string => {
    const now = new Date();
    const pakistanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
    return pakistanTime.toISOString().split('T')[0];
  }, []);

  const isLateArrival = useCallback((clockInTime: Date): boolean => {
    const pakistanTime = new Date(clockInTime.toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
    const hours = pakistanTime.getHours();
    return hours >= 20; // Late if after 8 PM
  }, []);

  const determineStatus = useCallback((hoursWorked: number, isLate: boolean): AttendanceRecord['status'] => {
    if (hoursWorked === 0) return 'INCOMPLETE';
    if (isLate) return 'LATE';
    if (hoursWorked >= SHIFT_CONFIG.OVERTIME_THRESHOLD) return 'OVERTIME';
    if (hoursWorked < SHIFT_CONFIG.UNDERTIME_THRESHOLD) return 'UNDERTIME';
    return 'COMPLETED';
  }, []);

  // --- DATA FETCHING with React Query ---
  const { data: todayAttendance, isLoading: isLoadingToday } = useQuery<AttendanceRecord | null>({
    queryKey: ['todayAttendance', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const today = getTodayDate();
      const { data, error } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('work_date', today)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // --- MUTATIONS with React Query ---
  const clockInMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated.');
      
      // Fetch fresh attendance record to avoid race conditions
      const today = getTodayDate();
      const { data: existing, error: fetchError } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('work_date', today)
        .maybeSingle();
      
      if (fetchError) throw fetchError;
      if (existing) throw new Error('You have already clocked in today. Please clock out first.');

      const now = new Date();
      const todayDate = getTodayDate();
      const isLate = isLateArrival(now);

      const { data, error } = await supabase
        .from('attendance_logs')
        .insert({
          user_id: user.id,
          user_email: user.email,
          user_name: user.user_metadata?.full_name || user.email.split('@')[0],
          work_date: todayDate,
          clock_in_time: now.toISOString(),
          status: isLate ? 'LATE' : 'ON_TIME',
        })
        .select()
        .single();

      if (error) {
        if (error.message.includes('duplicate key')) {
          throw new Error('You have already clocked in today. Please clock out first.');
        }
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todayAttendance', user?.id] });
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: async () => {
      if (!todayAttendance) throw new Error('Not clocked in.');

      const now = new Date();
      const clockInTime = new Date(todayAttendance.clock_in_time);
      const hoursWorked = (now.getTime() - clockInTime.getTime()) / 1000 / 60 / 60;
      const isLate = isLateArrival(clockInTime);
      const status = determineStatus(hoursWorked, isLate);

      const { data, error } = await supabase
        .from('attendance_logs')
        .update({
          clock_out_time: now.toISOString(),
          shift_hours: Math.round(hoursWorked * 100) / 100,
          status,
        })
        .eq('id', todayAttendance.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todayAttendance', user?.id] });
    },
  });

  return {
    todayAttendance,
    isLoadingToday,
    clockIn: clockInMutation.mutateAsync,
    isClockingIn: clockInMutation.isPending,
    clockOut: clockOutMutation.mutateAsync,
    isClockingOut: clockOutMutation.isPending,
    clockInError: clockInMutation.error,
    clockOutError: clockOutMutation.error,
    SHIFT_CONFIG,
  };
};

export default useClockInOut;
