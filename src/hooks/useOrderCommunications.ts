import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { OrderCommunication } from '../types';
import { logger } from '../services/logger';
import { queryKeys } from '../constants/queryKeys';

/**
 * Fetches the communication log for a specific order.
 * @param orderId The ID of the order to fetch communications for.
 */
const fetchOrderCommunications = async (orderId: number): Promise<OrderCommunication[]> => {
  if (!orderId) {
    return [];
  }

  const { data, error } = await supabase
    .from('order_communications')
    .select('id, sent_at, subject, template_id, recipient_email, user_email')
    .eq('order_id', orderId)
    .order('sent_at', { ascending: false });

  if (error) {
    logger.error('Error fetching order communications:', { orderId, error });
    throw new Error(error.message);
  }

  return data as unknown as OrderCommunication[];
};

export const useOrderCommunications = (orderId: number) => {
  return useQuery({
    queryKey: queryKeys.communications.byOrderId(orderId),
    queryFn: () => fetchOrderCommunications(orderId),
    enabled: !!orderId,
  });
};