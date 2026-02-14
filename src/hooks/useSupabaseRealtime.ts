import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { queryKeys } from '../constants/queryKeys';

export const useSupabaseRealtime = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Subscribe to orders table changes
    const ordersSubscription = supabase
      .channel('orders-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        (payload) => {
          console.log('[Realtime] Orders updated:', payload.eventType);
          queryClient.invalidateQueries({ queryKey: queryKeys.orders.all() });
          queryClient.invalidateQueries({ queryKey: queryKeys.orders.lists() });
          queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all() });
          queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all() });
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] Orders subscription active');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] Orders channel error:', err);
        } else if (status === 'TIMED_OUT') {
          console.warn('[Realtime] Orders subscription timed out — retrying...');
        }
      });

    // Subscribe to users table changes
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
            console.log('[Realtime] Users updated:', payload.eventType);
            queryClient.invalidateQueries({ queryKey: ['users'] });
          }
        )
        .subscribe((status, err) => {
          if (status === 'CHANNEL_ERROR') {
            console.warn('[Realtime] Users channel error:', err);
          }
        });
    } catch (error) {
      console.warn('[Realtime] Could not subscribe to users table:', error);
    }

    // Subscribe to order_history table (activity logs)
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
          console.log('[Realtime] Activity logged');
          // Invalidate all order history queries (without specific ID to catch all)
          queryClient.invalidateQueries({
            predicate: (query) =>
              Array.isArray(query.queryKey) &&
              query.queryKey[0] === 'orders' &&
              query.queryKey.includes('history'),
          });
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] Order history subscription active');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] Order history channel error:', err);
        }
      });

    // Cleanup subscriptions on unmount
    return () => {
      supabase.removeChannel(ordersSubscription);
      if (usersSubscription) supabase.removeChannel(usersSubscription);
      supabase.removeChannel(historySubscription);
    };
  }, [queryClient]);
};
