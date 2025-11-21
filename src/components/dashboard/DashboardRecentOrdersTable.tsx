// src/components/dashboard/DashboardRecentOrdersTable.tsx - FINAL VERSION

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
// 1. Import useNavigate to handle navigation programmatically
import { useNavigate } from 'react-router-dom';
import { Order, OrderStatus } from '../../types';
import { ChevronDown, ChevronUp, ArrowDownUp } from 'lucide-react';
import StatusBadge from '../ui/StatusBadge';
import Skeleton from '../ui/Skeleton';

interface TableRowProps {
  order: Order;
}

// 2. Modify the TableRow component to handle navigation
const TableRow: React.FC<TableRowProps> = ({ order }) => {
  const navigate = useNavigate();

  // The entire row now handles the click event
  return (
    <motion.tr
      onClick={() => navigate(`/order/${order.orderNumber}`)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="border-b border-slate-800 text-sm text-slate-300 transition-all duration-200 cursor-pointer hover:bg-slate-700/20 hover:shadow-lg hover:shadow-brand-orange/5"
    >
      {/* 3. The Link component is removed from the cell to prevent nested interactive elements.
          The cell is styled to look like a link for visual consistency. */}
      <td className="whitespace-nowrap px-6 py-4 font-mono text-brand-orange">
        {order.orderNumber}
      </td>
      <td className="whitespace-nowrap px-6 py-4">
        {new Date(order.createdAt).toLocaleDateString()}
      </td>
      <td className="whitespace-nowrap px-6 py-4 font-medium text-white">
        {order.customerName}
      </td>
      <td className="whitespace-nowrap px-6 py-4">
        {order.salesAgent}
      </td>
      <td className="whitespace-nowrap px-6 py-4">
        <StatusBadge status={order.status as OrderStatus} />
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-right font-semibold text-white">
        ${order.orderAmount.toLocaleString()}
      </td>
    </motion.tr>
  );
};

const TableSkeleton: React.FC = () => (
  <tbody>
    {Array.from({ length: 5 }).map((_, i) => (
      <tr key={i} className="border-b border-slate-800">
        {Array.from({ length: 6 }).map((_, j) => (
          <td key={j} className="px-6 py-4"><Skeleton height={24} /></td>
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

// The parent component remains unchanged as the logic is now encapsulated in TableRow.
const DashboardRecentOrdersTable: React.FC<DashboardRecentOrdersTableProps> = ({ 
  orders, 
  isLoading, 
  className 
}) => {
  const [sortConfig, setSortConfig] = useState<{ key: keyof Order; direction: 'asc' | 'desc' } | null>({ 
    key: 'createdAt', 
    direction: 'desc' 
  });

  const sortedOrders = useMemo(() => {
    if (!sortConfig) return orders;
    const { key, direction } = sortConfig;
    return [...orders].sort((a, b) => {
      if ((a[key] ?? 0) < (b[key] ?? 0)) return direction === 'asc' ? -1 : 1;
      if ((a[key] ?? 0) > (b[key] ?? 0)) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [orders, sortConfig]);

  const requestSort = (key: keyof Order) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const headers: { key: keyof Order; label: string; align?: 'left' | 'right' }[] = [
    { key: 'orderNumber', label: 'Order ID' },
    { key: 'createdAt', label: 'Date' },
    { key: 'customerName', label: 'Customer' },
    { key: 'salesAgent', label: 'Sales Agent' },
    { key: 'status', label: 'Status' },
    { key: 'orderAmount', label: 'Amount', align: 'right' },
  ];

  return (
    <div className={`overflow-hidden rounded-2xl bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 ${className}`}>
      <h3 className="text-lg font-semibold text-white px-6 py-4 border-b border-slate-700/50">
        Recent Orders
      </h3>
      <div>
        <table className="w-full text-left">
          <thead className="border-b border-slate-700/50 bg-slate-800/50">
            <tr>
              {headers.map(header => (
                <th 
                  key={header.key} 
                  scope="col" 
                  className={`px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-400 ${
                    header.align === 'right' ? 'text-right' : ''
                  }`}
                >
                  <button 
                    onClick={() => requestSort(header.key)} 
                    className="hover:text-slate-200 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      {header.label}
                      {sortConfig?.key === header.key ? (
                        sortConfig.direction === 'asc' ? (
                          <ChevronUp size={14} />
                        ) : (
                          <ChevronDown size={14} />
                        )
                      ) : (
                        <ArrowDownUp size={14} />
                      )}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          {isLoading ? (
            <TableSkeleton />
          ) : (
            <tbody>
              {sortedOrders.slice(0, 5).map(order => (
                <TableRow key={order.id} order={order} />
              ))}
            </tbody>
          )}
        </table>
      </div>
    </div>
  );
};

export default DashboardRecentOrdersTable;