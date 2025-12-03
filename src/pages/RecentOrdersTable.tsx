import React from 'react';
import { Order, OrderStatus, UserRole } from '../../types';
import { getStatusInfo } from '../../constants';
import { Package, Lock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Link } from 'react-router-dom';

const StatusBadge = ({ status }: { status: OrderStatus }) => {
  const config = getStatusInfo(status);
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${config.color}`}>
      {config.label}
    </span>
  );
};

const RecentOrdersTable = ({ orders }: { orders: Order[] }) => {
  const { role, permissions } = useAuth();
  
  // SECURITY CHECK:
  // Admins see everything. Users must have 'view_financials' checked.
  const canViewFinancials = role === UserRole.ADMIN || permissions?.view_financials;

  const recentOrders = orders.slice(0, 5);

  return (
    <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Recent Orders</h3>
        <span className="text-slate-400 text-sm">{orders.length} total orders</span>
      </div>
      
      <div className="space-y-3">
        {recentOrders.map((order) => (
          <Link 
            to={`/order/${order.orderNumber}`}
            key={order.id} 
            className="block group"
          >
            <div className="flex items-center justify-between p-3 bg-slate-700/20 rounded-lg group-hover:bg-slate-700/40 transition-all border border-transparent group-hover:border-slate-600">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-400 group-hover:text-blue-300 transition-colors">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-white font-medium text-sm group-hover:text-brand-orange transition-colors">
                    {order.customerName}
                  </p>
                  <p className="text-slate-400 text-xs">Order #{order.orderNumber}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <StatusBadge status={order.status as OrderStatus} />
                
                <div className="text-right min-w-[80px]">
                  {/* SECURED FINANCIAL COLUMN */}
                  {canViewFinancials ? (
                    <p className="text-white font-semibold text-sm">
                      ${order.orderAmount.toLocaleString()}
                    </p>
                  ) : (
                    <div className="flex items-center justify-end gap-1 text-slate-500">
                      <Lock className="w-3 h-3" />
                      <p className="text-xs italic">Hidden</p>
                    </div>
                  )}
                  <p className="text-slate-400 text-xs">
                    {new Date(order.createdAt).toLocaleDateString()}
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

export default RecentOrdersTable;