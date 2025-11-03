
import React from 'react';
import { OrderHistoryEntry } from '../../types/index';

interface OrderHistoryProps {
  history: OrderHistoryEntry[];
}

const OrderHistory: React.FC<OrderHistoryProps> = ({ history }) => {
  if (history.length === 0) {
    return (
        <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/60 rounded-2xl shadow-[0_0_25px_rgba(188,19,254,0.15)] p-6">
            <h3 className="text-xl font-semibold tracking-wide text-gray-100 mb-4">🕓 Order History</h3>
            <p className="text-gray-400">No activity has been logged for this order yet.</p>
        </div>
    );
  }

  return (
    <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/60 rounded-2xl shadow-[0_0_25px_rgba(188,19,254,0.15)] p-6">
      <h3 className="text-xl font-semibold tracking-wide text-gray-100 mb-4">🕓 Order History</h3>
      <ul className="space-y-5">
        {history.map((entry) => (
          <li key={entry.id} className="relative pl-6 border-l-2 border-slate-700">
            <div className="absolute -left-[7px] top-1 w-3 h-3 bg-[#BC13FE] rounded-full border-2 border-slate-900"></div>
            <div className="flex justify-between items-center">
                <p className="font-semibold text-gray-100 capitalize">
                {entry.field_changed.replace(/_/g, ' ')}
                </p>
                <p className="text-xs text-gray-500">{new Date(entry.changed_at).toLocaleDateString()}</p>
            </div>
            <div className="text-sm text-gray-300">
                {entry.old_value ? (
                    <>
                        <span className="text-red-400/70 line-through">{entry.old_value}</span> → <span className="text-green-400 font-medium">{entry.new_value}</span>
                    </>
                ) : (
                    <span className="text-gray-300">{entry.new_value}</span>
                )}
            </div>
            <p className="text-xs text-gray-500 mt-1">by {entry.user_email}</p>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default OrderHistory;
