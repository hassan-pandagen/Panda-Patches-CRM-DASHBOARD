import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getOrderCommunications } from './orderService';
import { OrderCommunication } from '../types';
import { queryKeys } from '../constants/queryKeys';
import { Mail, User, Send } from 'lucide-react';
import Spinner from '../components/ui/Spinner';

interface OrderCommunicationsProps {
  orderId: number;
}

const CommunicationItem: React.FC<{ comm: OrderCommunication }> = ({ comm }) => {
  const isInternal = comm.visibility === 'INTERNAL';
  return (
    <div className={`p-4 rounded-lg border ${isInternal ? 'bg-slate-800/50 border-slate-700' : 'bg-blue-900/20 border-blue-800'}`}>
      <div className="flex justify-between items-center text-xs text-slate-400 mb-2">
        <div className="flex items-center gap-2">
          <User className="w-3 h-3" />
          <span>From: {comm.userEmail || 'System'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Send className="w-3 h-3" />
          <span>To: {comm.recipientEmail}</span>
        </div>
      </div>
      <p className="font-semibold text-slate-200 mb-1">{comm.subject}</p>
      <p className="text-xs text-slate-500">
        {new Date(comm.sentAt).toLocaleString()}
      </p>
      {isInternal && (
        <span className="mt-2 inline-block text-xs font-bold uppercase tracking-wider bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 px-2 py-0.5 rounded-full">
          Internal
        </span>
      )}
    </div>
  );
};

const OrderCommunications: React.FC<OrderCommunicationsProps> = ({ orderId }) => {
  const { data: communications = [], isLoading, error } = useQuery({
    queryKey: queryKeys.orders.communications(orderId.toString()),
    queryFn: () => getOrderCommunications(orderId),
    enabled: !!orderId,
  });

  return (
    <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
      <h3 className="text-xl font-semibold tracking-wide text-slate-100 mb-4 flex items-center gap-2">
        <Mail className="w-5 h-5" />
        Communication Log
      </h3>
      <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
        {isLoading && <div className="flex justify-center p-4"><Spinner /></div>}
        {error && <p className="text-red-400 text-sm">Failed to load communications: {(error as Error).message}</p>}
        {!isLoading && communications.length === 0 && (
          <p className="text-slate-400 text-sm text-center py-4">No communications have been sent for this order yet.</p>
        )}
        {communications.map(comm => (
          <CommunicationItem key={comm.id} comm={comm} />
        ))}
      </div>
    </div>
  );
};

export default OrderCommunications;