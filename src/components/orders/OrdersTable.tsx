import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Order, OrderStatus } from '@/types';
import { ChevronDown, ChevronUp, ArrowDown, ArrowUp } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';

const TableSkeleton: React.FC = () => (
  <tbody>
    {Array.from({ length: 5 }).map((_, i) => (
      <tr key={i} className="border-b border-slate-800">
        <td className="px-6 py-4"><div className="h-4 bg-slate-700 rounded w-24 animate-pulse"></div></td>
        <td className="px-6 py-4"><div className="h-4 bg-slate-700 rounded w-20 animate-pulse"></div></td>
        <td className="px-6 py-4"><div className="h-4 bg-slate-700 rounded w-32 animate-pulse"></div></td>
        <td className="px-6 py-4"><div className="h-4 bg-slate-700 rounded w-28 animate-pulse"></div></td>
        <td className="px-6 py-4"><div className="h-6 bg-slate-700 rounded-full w-32 animate-pulse"></div></td>
        <td className="px-6 py-4 text-right"><div className="h-4 bg-slate-700 rounded w-16 animate-pulse ml-auto"></div></td>
      </tr>
    ))}
  </tbody>
);

interface OrdersTableProps {
  orders: Order[];
  isLoading?: boolean;
}

type SortKey = keyof Order | '';

const OrdersTable: React.FC<OrdersTableProps> = ({ orders, isLoading = false }) => {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const sortedOrders = useMemo(() => {
    if (!sortKey) return orders;
    return [...orders].sort((a, b) => {
      // Provide default fallback values to handle potential undefined properties
      const aValue = a[sortKey] ?? '';
      const bValue = b[sortKey] ?? '';

      // Handle null/undefined cases for robust sorting
      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [orders, sortKey, sortDirection]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  const SortableHeader: React.FC<{ sortField: SortKey; children: React.ReactNode }> = ({ sortField, children }) => (
    <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => handleSort(sortField)}>
      <div className="flex items-center gap-2">
        {children}
        {sortKey === sortField && (sortDirection === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />)}
      </div>
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm text-left text-slate-300">
        <thead className="bg-slate-900 text-xs text-slate-400 uppercase">
          <tr>
            <SortableHeader sortField="orderNumber">Order #</SortableHeader>
            <SortableHeader sortField="createdAt">Date</SortableHeader>
            <SortableHeader sortField="customerName">Customer</SortableHeader>
            <SortableHeader sortField="salesAgent">Sales Agent</SortableHeader>
            <SortableHeader sortField="status">Status</SortableHeader>
            <SortableHeader sortField="orderAmount">Amount</SortableHeader>
          </tr>
        </thead>
        {isLoading ? <TableSkeleton /> : (
          <tbody>
            <AnimatePresence initial={false}>
              {sortedOrders.map((order) => (
                <React.Fragment key={order.id}>
                  <motion.tr
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    whileHover={{ scale: 1.01 }}
                    onClick={() => {
                      setSelectedOrderId(order.id);
                      // Optional: You can decide if selection should also expand the row.
                      // For now, we'll keep them as separate interactions.
                      // setExpandedRow(expandedRow === order.id ? null : order.id);
                    }}
                    className={`border-b border-slate-800 cursor-pointer transition-all duration-200 ease-in-out
                      ${
                        selectedOrderId === order.id
                          ? 'bg-slate-700/50 border-l-4 border-blue-500' // Professional selected state
                          : 'border-l-4 border-transparent hover:bg-slate-800/50' // Unselected state
                      }
                    `}
                    whileTap={{ scale: 0.99 }}
                  >
                    <td className="px-6 py-4 font-medium text-sky-400 whitespace-nowrap group-hover:text-sky-300">
                      <Link to={`/order/${order.orderNumber}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-4">{format(new Date(order.createdAt), 'MMM dd, yyyy')}</td>
                    <td className="px-6 py-4">{order.customerName}</td>
                    <td className="px-6 py-4">{order.salesAgent}</td>
                    <td className="px-6 py-4"><StatusBadge status={order.status as OrderStatus} /></td>
                    <td className="px-6 py-4 text-right font-medium">${order.orderAmount.toFixed(2)}</td>
                  </motion.tr>
                  <AnimatePresence>
                    {expandedRow === order.id && (
                      <motion.tr>
                        <td colSpan={6} className="p-0">
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: 'easeInOut' }}
                            className="bg-slate-900/50 overflow-hidden"
                          >
                            <div className="p-6 grid grid-cols-3 gap-6 text-sm">
                              <div><h4 className="font-bold text-slate-400 mb-1">Amount Paid</h4><p>${order.amountPaid.toFixed(2)}</p></div>
                              <div><h4 className="font-bold text-slate-400 mb-1">Amount Remaining</h4><p className="text-amber-400">${order.amountRemaining.toFixed(2)}</p></div>
                              <div><h4 className="font-bold text-slate-400 mb-1">Urgent</h4><p>{order.isUrgent ? 'Yes' : 'No'}</p></div>
                            </div>
                          </motion.div>
                        </td>
                      </motion.tr>
                    )}
                  </AnimatePresence>
                </React.Fragment>
              ))}
            </AnimatePresence>
          </tbody>
        )}
      </table>
    </div>
  );
};

export default OrdersTable;
