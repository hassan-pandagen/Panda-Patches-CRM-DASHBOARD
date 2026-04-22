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
import { localMidnightISO, localNextDayISO } from '../utils/dateFilters';

export const useQueryPrefetch = () => {
  const queryClient = useQueryClient();

  /**
   * Prefetch orders for /orders page
   * Prefetches page 1 of ALL filter + the tab counts
   */
  const prefetchOrders = async () => {
    try {
      // Prefetch page 1 of "ALL" filter
      const params = { page: 1, filter: 'ALL', search: '' };
      await queryClient.prefetchQuery({
        queryKey: queryKeys.orders.paginated(params),
        queryFn: async () => {
          const { data, error, count } = await supabase
            .from('orders')
            .select('id, order_number, customer_name, customer_email, design_name, status, created_at, sales_agent, order_amount, amount_paid, is_urgent', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(0, 14);
          if (error) throw error;
          return { orders: (data || []).map(mapDbToOrder), totalCount: count || 0 };
        },
        staleTime: 15000,
      });
    } catch (error) {
      console.warn('Failed to prefetch orders:', error);
    }
  };

  /**
   * Prefetch dashboard metrics for last 7 days
   */
  const prefetchDashboard = async () => {
    try {
      // Prefetch current month (matches Dashboard default)
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const pad = (n: number) => String(n).padStart(2, '0');
      const startDateStr = `${year}-${pad(month + 1)}-01`;
      const endDateStr = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`;

      await queryClient.prefetchQuery({
        queryKey: queryKeys.dashboard.unified(startDateStr, endDateStr),
        queryFn: async () => {
          const { data, error } = await supabase
            .from('orders')
            .select('id, order_number, customer_name, customer_email, design_name, status, created_at, updated_at, sales_agent, order_amount, amount_paid, is_urgent, lead_source, patches_type')
            .gte('created_at', localMidnightISO(startDateStr))
            .lt('created_at', localNextDayISO(endDateStr));

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
      // Prefetch current month (matches Reports default)
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const pad = (n: number) => String(n).padStart(2, '0');
      const startDateStr = `${year}-${pad(month + 1)}-01`;
      const endDateStr = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`;

      await queryClient.prefetchQuery({
        queryKey: queryKeys.orders.report(startDateStr, endDateStr),
        queryFn: async () => {
          const { data, error } = await supabase
            .from('orders')
            .select('*')
            .gte('created_at', localMidnightISO(startDateStr))
            .lt('created_at', localNextDayISO(endDateStr))
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
