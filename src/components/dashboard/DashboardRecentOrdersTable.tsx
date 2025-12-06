import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Order, OrderStatus } from '../../types';
import { ChevronDown, ChevronUp, ArrowDownUp } from 'lucide-react';
import StatusBadge from '../ui/StatusBadge';
import Skeleton from '../ui/Skeleton';

interface TableRowProps {
  order: Order;
}

const TableRow: React.FC<TableRowProps> = ({ order }) => {
  const navigate = useNavigate();

  return (
    <motion.tr
      onClick={() => navigate(`/order/${order.orderNumber}`)}
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      whileHover={{ backgroundColor: "rgba(51, 65, 85, 0.4)" }}
      className="border-b border-white/5 text-sm text-slate-300 transition-colors cursor-pointer group"
    >
      {/* Order ID (Fixed Width) */}
      <td className="whitespace-nowrap px-6 py-4 font-mono text-brand-orange w-32">
        {order.orderNumber}
      </td>
      
      {/* Date (Fixed Width) */}
      <td className="whitespace-nowrap px-6 py-4 w-32">
        {new Date(order.createdAt).toLocaleDateString()}
      </td>
      
      {/* Customer (Flexible, Truncated) */}
      <td className="whitespace-nowrap px-6 py-4 font-medium text-white max-w-[180px] truncate" title={order.customerName}>
        {order.customerName}
      </td>
      
      {/* Sales Agent (Flexible, Truncated) */}
      <td className="whitespace-nowrap px-6 py-4 max-w-[200px] truncate text-slate-400" title={order.salesAgent}>
        {order.salesAgent}
      </td>
      
      {/* Status (Fixed Width) */}
      <td className="whitespace-nowrap px-6 py-4 w-36">
        <StatusBadge status={order.status as OrderStatus} />
      </td>
      
      {/* Amount (Fixed Width, Left Aligned as requested) */}
      <td className="whitespace-nowrap px-6 py-4 text-left font-semibold text-emerald-400 w-32">
        ${(order.orderAmount || 0).toLocaleString()}
      </td>
    </motion.tr>
  );
};

const TableSkeleton: React.FC = () => (
  <tbody>
    {Array.from({ length: 5 }).map((_, i) => (
      <tr key={i} className="border-b border-slate-800">
        {Array.from({ length: 6 }).map((_, j) => ( // Use a simple div for skeleton
          <td key={j} className="px-6 py-4"><Skeleton height={20} className="bg-slate-700/50" /></td>
        ))}
      </tr>
    ))}
  </tbody>
);

interface DashboardRecentOrdersTableProps {
  orders: Order[];
  isLoading?: boolean;
  className?: string;
}

const DashboardRecentOrdersTable: React.FC<DashboardRecentOrdersTableProps> = ({ 
  orders, 
  isLoading, 
  className
}) => {
  // Headers are now for display only. Sorting logic is moved to the parent.
  const headers = [
    { key: 'orderNumber', label: 'Order ID', width: 'w-32' },
    { key: 'createdAt', label: 'Date', width: 'w-32' },
    { key: 'customerName', label: 'Customer', width: 'w-auto' }, // Flexible
    { key: 'salesAgent', label: 'Sales Agent', width: 'w-auto' }, // Flexible
    { key: 'status', label: 'Status', width: 'w-36' },
    { key: 'orderAmount', label: 'Amount', width: 'w-32', align: 'left' },
  ] as const;

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-slate-900/40 backdrop-blur-xl border border-white/10 shadow-xl ${className}`}>
      <div className="relative z-10 overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-800/50 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-white/10">
            <tr>
              {headers.map((header) => (
                <th 
                  key={header.key} 
                  scope="col" 
                  className={`px-6 py-4 ${header.width} transition-colors`}
                >
                  <div 
                    className={`flex items-center gap-2 w-full ${
                        header.align === 'right' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {header.label}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          
          {isLoading ? (
            <TableSkeleton />
          ) : (
            <tbody>
              {orders.length === 0 ? (
                  <tr>
                      <td colSpan={6} className="text-center py-10 text-slate-500">
                          No recent orders found.
                      </td>
                  </tr>
              ) : (
                  orders.slice(0, 8).map(order => ( // Show max 8 rows for cleaner dashboard
                      <TableRow key={order.id} order={order} />
                  ))
              )}
            </tbody>
          )}
        </table>
      </div>
    </div>
  );
};

export default DashboardRecentOrdersTable;