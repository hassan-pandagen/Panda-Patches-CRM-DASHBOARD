import React, { useState, useEffect } from 'react';
import { getOrderCommunications } from './orderService';
import { OrderCommunication } from '../../types/index';
import { Mail, User } from 'lucide-react';
import { format } from 'date-fns';

interface OrderCommunicationsProps {
  orderId: number;
}

const OrderCommunications: React.FC<OrderCommunicationsProps> = ({ orderId }) => {
  const [communications, setCommunications] = useState<OrderCommunication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCommunications = async () => {
      setLoading(true);
      const data = await getOrderCommunications(orderId);
      setCommunications(data);
      setLoading(false);
    };

    if (orderId) {
      fetchCommunications();
    }
  }, [orderId]);

  if (loading) {
    return <div className="text-center p-4">Loading email history...</div>;
  }

  if (communications.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 mt-6">
        <h3 className="text-lg font-semibold text-white mb-2">Communication History</h3>
        <p className="text-gray-400">No emails have been sent for this order yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4 mt-6">
      <h3 className="text-lg font-semibold text-white mb-4">Communication History</h3>
      <div className="space-y-4">
        {communications.map((comm) => (
          <div key={comm.id} className="p-3 bg-gray-700 rounded-md border border-gray-600">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-bold text-white">{comm.subject}</p>
                <p className="text-sm text-gray-300 flex items-center">
                  <Mail className="w-4 h-4 mr-2" />
                  To: {comm.recipient_email}
                </p>
              </div>
              <div className="text-right text-xs text-gray-400">
                <p>{format(new Date(comm.sent_at), 'MMM d, yyyy')}</p>
                <p>{format(new Date(comm.sent_at), 'h:mm a')}</p>
              </div>
            </div>
            {comm.user_email && (
              <div className="mt-2 pt-2 border-t border-gray-600 text-xs text-gray-400 flex items-center">
                <User className="w-3 h-3 mr-2" />
                Sent by: {comm.user_email}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default OrderCommunications;
