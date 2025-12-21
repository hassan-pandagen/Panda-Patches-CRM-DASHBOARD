import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { queryKeys } from '../constants/queryKeys';

export const useSupabaseRealtime = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    // ✅ Subscribe to orders table changes
    const ordersSubscription = supabase
      .channel('orders-channel')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events: INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'orders',
        },
        (payload) => {
          console.log('📊 Orders updated:', payload);
          // Invalidate all order-related queries
          queryClient.invalidateQueries({ queryKey: queryKeys.orders.all() });
          queryClient.invalidateQueries({ queryKey: queryKeys.orders.lists() });
        }
      )
      .subscribe();

    // ✅ Subscribe to users table changes (if you have a public.users table)
    // Note: auth.users is protected and cannot be used for realtime
    let usersSubscription: any = null;
    try {
      usersSubscription = supabase
        .channel('users-channel')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'users',
          },
          (payload) => {
            console.log('👤 Users updated:', payload);
            // Invalidate user-related queries
            queryClient.invalidateQueries({ queryKey: ['users'] });
          }
        )
        .subscribe();
    } catch (error) {
      console.warn('⚠️ Could not subscribe to users table:', error);
    }

    // ✅ Subscribe to order_history table (activity logs)
    const historySubscription = supabase
      .channel('order-history-channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'order_history',
        },
        (payload) => {
          console.log('📝 Activity logged:', payload);
          // Invalidate order history queries
          queryClient.invalidateQueries({ queryKey: queryKeys.orders.history() });
        }
      )
      .subscribe();

    // Cleanup subscriptions on unmount
    return () => {
      supabase.removeChannel(ordersSubscription);
      supabase.removeChannel(usersSubscription);
      supabase.removeChannel(historySubscription);
    };
  }, [queryClient]);
};
