import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../services/supabaseClient';
import { useCustomerAuth } from '../../contexts/CustomerAuthContext';
import { mapDbToOrder } from '../../services/orderService';
import { Order, OrderStatus } from '../../types';
import { NavLink } from 'react-router-dom';
import { Package, Clock, Truck, CheckCircle, ChevronRight, AlertTriangle } from 'lucide-react';

const STATUS_DISPLAY: Record<string, { label: string; color: string; bg: string }> = {
  NEW_ORDER: { label: 'Order Received', color: 'text-blue-400', bg: 'bg-blue-400/10' },
  REVISION_REQUESTED: { label: 'Design In Progress', color: 'text-orange-400', bg: 'bg-orange-400/10' },
  AWAITING_CUSTOMER_APPROVAL: { label: 'Awaiting Your Approval', color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  APPROVED: { label: 'Design Approved', color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  IN_PRODUCTION: { label: 'In Production', color: 'text-blue-400', bg: 'bg-blue-400/10' },
  QUALITY_ASSURANCE: { label: 'Quality Check', color: 'text-purple-400', bg: 'bg-purple-400/10' },
  REMAKE: { label: 'Being Remade', color: 'text-orange-400', bg: 'bg-orange-400/10' },
  COMPLETED: { label: 'Ready to Ship', color: 'text-teal-400', bg: 'bg-teal-400/10' },
  SHIPPED: { label: 'Shipped', color: 'text-orange-400', bg: 'bg-orange-400/10' },
  DELIVERED: { label: 'Delivered', color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  FEEDBACK: { label: 'Complete', color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  CANCELLED: { label: 'Cancelled', color: 'text-red-400', bg: 'bg-red-400/10' },
  REFUNDED: { label: 'Refunded', color: 'text-red-400', bg: 'bg-red-400/10' },
};

const CustomerDashboard: React.FC = () => {
  const { profile } = useCustomerAuth();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['customer-orders', profile?.email],
    queryFn: async () => {
      if (!profile?.email) return [];
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []).map(mapDbToOrder);
    },
    enabled: !!profile?.email,
  });

  const activeOrders = orders.filter(o => !['CANCELLED', 'REFUNDED', 'DELIVERED', 'FEEDBACK'].includes(o.status));
  const completedOrders = orders.filter(o => ['DELIVERED', 'FEEDBACK'].includes(o.status));

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">
          Welcome back, {profile?.full_name || profile?.email?.split('@')[0]}
        </h1>
        <p className="text-slate-400 mt-1">Track your orders and patch journey</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard icon={<Package className="w-5 h-5 text-blue-400" />} label="Total Orders" value={orders.length} />
        <SummaryCard icon={<Clock className="w-5 h-5 text-orange-400" />} label="Active" value={activeOrders.length} />
        <SummaryCard icon={<Truck className="w-5 h-5 text-purple-400" />} label="Shipped" value={orders.filter(o => o.status === 'SHIPPED').length} />
        <SummaryCard icon={<CheckCircle className="w-5 h-5 text-emerald-400" />} label="Delivered" value={completedOrders.length} />
      </div>

      {/* Active Orders */}
      {activeOrders.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Active Orders</h2>
          <div className="space-y-3">
            {activeOrders.map(order => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        </div>
      )}

      {/* Completed Orders */}
      {completedOrders.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-3 mt-8">Completed Orders</h2>
          <div className="space-y-3">
            {completedOrders.map(order => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-brand-orange border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && orders.length === 0 && (
        <div className="text-center py-20">
          <Package className="w-16 h-16 text-slate-700 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No orders yet</h3>
          <p className="text-slate-400 text-sm">
            Orders placed with this email will appear here automatically.
          </p>
        </div>
      )}
    </div>
  );
};

// Summary card component
const SummaryCard: React.FC<{ icon: React.ReactNode; label: string; value: number }> = ({ icon, label, value }) => (
  <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-4 sm:p-5">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs sm:text-sm text-slate-400">{label}</p>
        <p className="text-2xl sm:text-3xl font-bold text-white mt-1">{value}</p>
      </div>
      <div className="p-2.5 bg-white/5 rounded-xl">{icon}</div>
    </div>
  </div>
);

// Order card component
const OrderCard: React.FC<{ order: Order }> = ({ order }) => {
  const statusConfig = STATUS_DISPLAY[order.status] || STATUS_DISPLAY.NEW_ORDER;
  const needsApproval = order.status === 'AWAITING_CUSTOMER_APPROVAL';

  return (
    <NavLink
      to={`/customer/order/${order.orderNumber}`}
      className="block bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-4 sm:p-5 hover:border-brand-orange/30 transition-all group"
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-white font-semibold">{order.orderNumber}</span>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusConfig.color} ${statusConfig.bg}`}>
              {statusConfig.label}
            </span>
            {needsApproval && (
              <span className="text-xs px-2.5 py-1 rounded-full font-medium text-yellow-400 bg-yellow-400/10 animate-pulse flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Action Required
              </span>
            )}
          </div>

          <div className="flex items-center gap-4 mt-2 text-sm text-slate-400">
            {order.designName && <span>{order.designName}</span>}
            {order.patchesType && <span>{order.patchesType}</span>}
            {order.patchesQuantity && <span>{order.patchesQuantity} pcs</span>}
          </div>

          <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-500">
            <span>{new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            {order.orderAmount != null && <span>${order.orderAmount.toLocaleString()}</span>}
          </div>
        </div>

        <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-brand-orange transition-colors shrink-0" />
      </div>
    </NavLink>
  );
};

export default CustomerDashboard;
