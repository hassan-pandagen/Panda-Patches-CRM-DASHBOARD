import React from 'react';
import { Package } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Order } from '../../types';
import StatusBadge from './StatusBadge';

const DashboardRecentOrdersTable: React.FC<{ orders: Order[] }> = ({ orders }) => {
  const recent = orders.slice(0, 5);

  return (
    <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Recent Orders</h3>
        <span className="text-slate-400 text-sm">{orders.length} total</span>
      </div>
      <div className="space-y-3">
        {recent.map((o) => (
          <Link
            key={o.id}
            to={`/order/${o.orderNumber}`}
            className="block p-3 bg-slate-700/20 rounded-lg hover:bg-slate-700/30 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                  <Package className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-white font-medium text-sm">{o.customerName}</p>
                  <p className="text-slate-400 text-xs">Order #{o.orderNumber}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <StatusBadge status={o.status} />
                <div className="text-right">
                  <p className="text-white font-semibold text-sm">${o.orderAmount}</p>
                  <p className="text-slate-400 text-xs">
                    {new Date(o.createdAt).toLocaleString("en-US", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default DashboardRecentOrdersTable;
