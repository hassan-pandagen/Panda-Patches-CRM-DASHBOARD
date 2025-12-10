import React, { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { queryKeys } from '../constants/queryKeys';
import { logger } from '../services/logger';

export const useRealtimeOrders = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    try {
      const channel = supabase
        .channel('orders-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders' },
          async () => {
            try {
              await queryClient.refetchQueries({ queryKey: queryKeys.orders.all(), type: 'active', exact: false });
              await queryClient.refetchQueries({ queryKey: queryKeys.orders.report('', ''), type: 'active', exact: false });
            } catch (err: any) {
              logger.error('[Realtime] Error refetching orders', err);
              // Don't throw - keep subscription alive
            }
          }
        )
        .subscribe((status, err) => {
          // ✅ DAY 2 FIX: Add subscription error handler
          if (status === 'SUBSCRIBED') {
            logger.info('[Realtime] Orders subscription active');
          } else if (status === 'CHANNEL_ERROR') {
            logger.error('[Realtime] Channel error', err);
          } else if (status === 'TIMED_OUT') {
            logger.warn('[Realtime] Subscription timed out');
          }
        });

      return () => {
        try {
          supabase.removeChannel(channel);
          logger.info('[Realtime] Orders subscription cleaned up');
        } catch (err: any) {
          logger.error('[Realtime] Error removing channel', err);
        }
      };
    } catch (err: any) {
      logger.error('[Realtime] Error setting up orders subscription', err);
      return () => {};
    }
  }, [queryClient]);
};
