import { Order, OrderStatus } from '../types';
import { getStatusInfo } from '../constants';
import { Package } from 'lucide-react';

const StatusBadge = ({ status }: { status: OrderStatus }) => {
  const config = getStatusInfo(status);
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${config.color}`}>
      {config.label}
    </span>
  );
};

const RecentOrdersTable = ({ orders }: { orders: Order[] }) => {
  const recentOrders = orders.slice(0, 5);

  return (
    <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Recent Orders</h3>
        <span className="text-slate-400 text-sm">{orders.length} total orders</span>
      </div>
      <div className="space-y-3">
        {recentOrders.map((order) => (
          <div key={order.id} className="flex items-center justify-between p-3 bg-slate-700/20 rounded-lg hover:bg-slate-700/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <Package className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <p className="text-white font-medium text-sm">{order.customerName}</p>
                <p className="text-slate-400 text-xs">Order #{order.orderNumber}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <StatusBadge status={order.status as OrderStatus} />
              <div className="text-right">
                <p className="text-white font-semibold text-sm">${order.orderAmount}</p>
                <p className="text-slate-400 text-xs">{new Date(order.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RecentOrdersTable;