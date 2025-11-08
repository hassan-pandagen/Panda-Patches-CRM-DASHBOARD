import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';

export const useRealtimeOrders = () => {
const queryClient = useQueryClient();

useEffect(() => {
const channel = supabase
.channel('orders-realtime')
.on(
'postgres_changes',
{ event: '*', schema: 'public', table: 'orders' },
async () => {
await queryClient.refetchQueries({ queryKey: ['orders'], type: 'active', exact: false });
await queryClient.refetchQueries({ queryKey: ['allOrdersReport'], type: 'active', exact: false });
}
)
.subscribe();

return () => {
  supabase.removeChannel(channel);
};

}, [queryClient]);
};
