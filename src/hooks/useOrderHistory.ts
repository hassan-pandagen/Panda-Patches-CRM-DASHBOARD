import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { queryKeys } from '../constants/queryKeys';
import { OrderHistoryEntry } from '../types';
import { logger } from '../services/logger';

/**
 * Fetches the history log for a specific order from the `order_history` table.
 * @param orderId The ID of the order to fetch history for.
 * @returns A promise that resolves to an array of order history entries.
 */
const fetchOrderHistory = async (orderId: number): Promise<OrderHistoryEntry[]> => {
  if (!orderId) {
    return [];
  }

  const { data, error } = await supabase
    .from('order_history')
    .select('*')
    .eq('order_id', orderId)
    .order('changed_at', { ascending: false });

  if (error) {
    logger.error('Error fetching order history:', { orderId, error });
    throw new Error(error.message);
  }

  // The table columns match the OrderHistoryEntry type, so no mapping is needed.
  return data as OrderHistoryEntry[];
};

export const useOrderHistory = (orderId: number) => {
  return useQuery({
    queryKey: queryKeys.orders.history(orderId),
    queryFn: () => fetchOrderHistory(orderId),
    enabled: !!orderId, // Only run the query if orderId is a valid number
  });
};