/**
 * useQueryPrefetch.ts
 * 
 * Centralized hook for prefetching queries
 * Eliminates first-load flicker by loading data before navigation
 * 
 * Usage:
 * const { prefetchOrders, prefetchDashboard, prefetchReports } = useQueryPrefetch();
 * 
 * <NavLink 
 *   to="/orders" 
 *   onMouseEnter={() => prefetchOrders()}
 * >
 *   Orders
 * </NavLink>
 */

import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { mapDbToOrder } from '../services/orderService';
import { queryKeys } from '../constants/queryKeys';

export const useQueryPrefetch = () => {
  const queryClient = useQueryClient();

  /**
   * Prefetch orders for /orders page
   * Loads latest 50 orders
   */
  const prefetchOrders = async () => {
    try {
      await queryClient.prefetchQuery({
        queryKey: queryKeys.orders.all(),
        queryFn: async () => {
          const { data, error } = await supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

          if (error) throw error;
          return (data || []).map(mapDbToOrder);
        },
        staleTime: 60000, // 1 minute
      });
    } catch (error) {
      console.warn('Failed to prefetch orders:', error);
      // Don't throw - let the actual page request handle errors
    }
  };

  /**
   * Prefetch dashboard metrics for last 7 days
   */
  const prefetchDashboard = async () => {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 7);

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      await queryClient.prefetchQuery({
        queryKey: queryKeys.dashboard.metrics(startDateStr, endDateStr),
        queryFn: async () => {
          const start = new Date(`${startDateStr}T00:00:00.000Z`).toISOString();
          const end = new Date(`${endDateStr}T23:59:59.999Z`).toISOString();

          const { data, error } = await supabase
            .from('orders')
            .select('*')
            .gte('created_at', start)
            .lte('created_at', end);

          if (error) throw error;
          return (data || []).map(mapDbToOrder);
        },
        staleTime: 60000,
      });

      // Also prefetch table data with default range
      await queryClient.prefetchQuery({
        queryKey: queryKeys.dashboard.table(startDateStr, endDateStr),
        queryFn: async () => {
          const start = new Date(`${startDateStr}T00:00:00.000Z`).toISOString();
          const end = new Date(`${endDateStr}T23:59:59.999Z`).toISOString();

          const { data, error } = await supabase
            .from('orders')
            .select('*')
            .gte('created_at', start)
            .lte('created_at', end);

          if (error) throw error;
          return (data || []).map(mapDbToOrder);
        },
        staleTime: 60000,
      });
    } catch (error) {
      console.warn('Failed to prefetch dashboard:', error);
    }
  };

  /**
   * Prefetch reports - minimal for now
   * Extend based on your reports page needs
   */
  const prefetchReports = async () => {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(endDate.getMonth() - 1);

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      // Prefetch same data as orders but with different key
      await queryClient.prefetchQuery({
        queryKey: queryKeys.orders.report(startDateStr, endDateStr),
        queryFn: async () => {
          const start = new Date(`${startDateStr}T00:00:00.000Z`).toISOString();
          const end = new Date(`${endDateStr}T23:59:59.999Z`).toISOString();

          const { data, error } = await supabase
            .from('orders')
            .select('*')
            .gte('created_at', start)
            .lte('created_at', end)
            .order('created_at', { ascending: false });

          if (error) throw error;
          return (data || []).map(mapDbToOrder);
        },
        staleTime: 60000,
      });
    } catch (error) {
      console.warn('Failed to prefetch reports:', error);
    }
  };

  /**
   * Prefetch clock in/out data - today's attendance
   */
  const prefetchClockInOut = async () => {
    try {
      // This will be populated with actual clock data
      // For now, just trigger the query
      await queryClient.prefetchQuery({
        queryKey: queryKeys.attendance.today(),
        queryFn: async () => {
          // Replace with your actual clock-in-out query
          return [];
        },
        staleTime: 60000,
      });
    } catch (error) {
      console.warn('Failed to prefetch clock in/out:', error);
    }
  };

  return {
    prefetchOrders,
    prefetchDashboard,
    prefetchReports,
    prefetchClockInOut,
  };
};

export default useQueryPrefetch;
