import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { Order, OrderStatus } from '../../types';
import StatusBadge from '../ui/StatusBadge';
import { DollarSign, ShoppingBag, Clock } from 'lucide-react';

interface CustomerOrderHistoryProps {
  /** Newest first — callers are responsible for sort order. */
  orders: Order[];
}

/**
 * Metrics cards + order history table, shared between CustomerHistoryPage (email/phone-keyed,
 * read-only) and CustomerAccountPage (id-keyed, editable master record). Pure presentational —
 * no data fetching.
 */
const CustomerOrderHistory: React.FC<CustomerOrderHistoryProps> = ({ orders }) => {
  const navigate = useNavigate();

  const metrics = useMemo(() => {
    const totalSpent = orders.reduce((sum, o) => sum + (o.orderAmount || 0), 0);
    const orderCount = orders.length;
    const lastOrderDate = orders[0]?.createdAt
      ? format(new Date(orders[0].createdAt), 'MMM dd, yyyy')
      : 'N/A';
    return { totalSpent, orderCount, lastOrderDate };
  }, [orders]);

  return (
    <>
      {/* METRICS CARDS - Matching Dashboard Style */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-6"
      >
        {/* Lifetime Value Card */}
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl opacity-0 group-hover:opacity-30 blur transition duration-500" />
          <div className="relative bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-500/10 rounded-xl">
                <DollarSign className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">Lifetime Value</p>
                <p className="text-3xl font-bold text-white mt-1">
                  ${metrics.totalSpent.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Total Orders Card */}
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl opacity-0 group-hover:opacity-30 blur transition duration-500" />
          <div className="relative bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-500/10 rounded-xl">
                <ShoppingBag className="w-8 h-8 text-purple-400" />
              </div>
              <div>
                <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">Total Orders</p>
                <p className="text-3xl font-bold text-white mt-1">{metrics.orderCount}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Last Active Card */}
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-orange to-orange-500 rounded-2xl opacity-0 group-hover:opacity-30 blur transition duration-500" />
          <div className="relative bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-brand-orange/10 rounded-xl">
                <Clock className="w-8 h-8 text-brand-orange" />
              </div>
              <div>
                <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">Last Active</p>
                <p className="text-2xl font-bold text-white mt-1">{metrics.lastOrderDate}</p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* HISTORY TABLE */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="relative group"
      >
        <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl opacity-0 group-hover:opacity-30 blur transition duration-500" />
        <div className="relative bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl overflow-hidden">
          <div className="px-6 py-5 border-b border-white/10">
            <h3 className="text-lg font-bold text-white">Order History</h3>
            <p className="text-sm text-slate-400 mt-1">Complete transaction history for this customer</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/50 text-xs uppercase font-semibold tracking-wider text-slate-400">
                <tr>
                  <th className="px-6 py-4">Order ID</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Design</th>
                  <th className="px-6 py-4">Contact Used</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Amount</th>
                  <th className="px-6 py-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4">
                      <button
                        onClick={() => navigate(`/order/${order.orderNumber}`)}
                        className="font-mono font-bold text-brand-orange hover:text-orange-400 hover:underline transition-colors"
                      >
                        {order.orderNumber}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-slate-300">
                      {order.createdAt
                        ? format(new Date(order.createdAt), 'MMM dd, yyyy')
                        : 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-white font-medium">{order.designName || 'N/A'}</td>
                    <td className="px-6 py-4 text-xs">
                      {order.customerEmail && (
                        <div className="text-sky-300 mb-1">{order.customerEmail}</div>
                      )}
                      {order.customerPhone && (
                        <div className="text-slate-400">{order.customerPhone}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={order.status as OrderStatus} />
                    </td>
                    <td className="px-6 py-4 text-right text-emerald-400 font-bold font-mono">
                      ${Number(order.orderAmount || 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => navigate(`/order/${order.orderNumber}`)}
                        className="px-3 py-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 hover:bg-blue-400/10 rounded-lg transition-colors"
                      >
                        VIEW
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default CustomerOrderHistory;
