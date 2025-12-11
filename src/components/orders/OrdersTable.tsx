import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Order, OrderStatus } from '@/types';
import { Calendar, ArrowDown, ArrowUp, Mail, Phone, ExternalLink, ChevronRight } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import { useAuth } from '@/contexts/AuthContext'; // 1. Import Auth

// --- LOADING SKELETON ---
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
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const navigate = useNavigate();

  // 2. GET CURRENT ROLE
  const { role } = useAuth();
  const isAdmin = role === 'ADMIN';

  // --- SORTING LOGIC ---
  const sortedOrders = useMemo(() => {
    if (!sortKey) return orders;
    return [...orders].sort((a, b) => {
      const aValue = a[sortKey];
      const bValue = b[sortKey];
      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      }
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
    <th scope="col" className="px-6 py-3 cursor-pointer group" onClick={() => handleSort(sortField)}>
      <div className="flex items-center gap-2 group-hover:text-white transition-colors">
        {children}
        {sortKey === sortField ? (
            sortDirection === 'asc' ? <ArrowUp className="w-4 h-4 text-brand-orange" /> : <ArrowDown className="w-4 h-4 text-brand-orange" />
        ) : (
            <ArrowDown className="w-4 h-4 opacity-0 group-hover:opacity-50" />
        )}
      </div>
    </th>
  );

  const handleContactClick = (e: React.MouseEvent, identifier: string) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/customers/${encodeURIComponent(identifier)}`);
  };

  const handleRowClick = (orderNumber: string) => {
    navigate(`/order/${orderNumber}`);
  };

  return (
    <div className="overflow-x-auto relative z-0 min-h-[400px]">
      <table className="min-w-full text-sm text-left text-slate-300">
        <thead className="bg-slate-900/80 backdrop-blur-sm text-xs text-slate-400 uppercase sticky top-0 z-30 shadow-sm">
          <tr>
            <SortableHeader sortField="orderNumber">Order #</SortableHeader>
            <SortableHeader sortField="customerName">Customer</SortableHeader>
            <th scope="col" className="px-6 py-3">Contact History</th>
            <SortableHeader sortField="salesAgent">Sales Agent</SortableHeader>
            <SortableHeader sortField="status">Status</SortableHeader>
            <SortableHeader sortField="orderAmount">Amount</SortableHeader>
            
            {/* 3. ONLY SHOW PROFIT HEADER IF ADMIN */}
            {isAdmin && (
               <SortableHeader sortField="profit">Profit</SortableHeader>
            )}
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
                    transition={{ duration: 0.1 }}
                    onClick={() => handleRowClick(order.orderNumber)}
                    className="border-b border-slate-800 hover:bg-slate-800/60 cursor-pointer transition-colors group"
                  >
                    <td className="px-6 py-4 font-medium whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-white font-bold group-hover:text-brand-orange transition-colors">
                            {order.orderNumber}
                        </span>
                        <div className="flex items-center gap-1.5 text-slate-500 text-xs mt-1">
                            <Calendar className="w-3 h-3" />
                            <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 font-medium text-white">
                        {order.customerName}
                    </td>
                    
                    <td className="px-6 py-4 relative z-20">
                      <div className="flex flex-col gap-2 items-start">
                        {order.customerEmail && (
                          <button
                            type="button"
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              navigate(`/customers/${order.customerEmail}`); 
                            }}
                            className="flex items-center gap-2 px-2 py-1 rounded bg-slate-900/50 border border-slate-700/50 hover:border-cyan-500/50 hover:bg-slate-800 transition-all group/btn"
                            title="View Customer History"
                          >
                            <Mail className="w-3.5 h-3.5 text-slate-500 group-hover/btn:text-cyan-400" />
                            <span className="text-xs text-slate-300 group-hover/btn:text-cyan-400 font-medium truncate max-w-[140px]">
                              {order.customerEmail}
                            </span>
                            <ExternalLink className="w-3 h-3 text-cyan-400 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                          </button>
                        )}
                        
                        {order.customerPhone && (
                          <button
                            type="button"
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              navigate(`/customers/${order.customerPhone}`); 
                            }}
                            className="flex items-center gap-2 px-2 py-1 rounded bg-slate-900/50 border border-slate-700/50 hover:border-emerald-500/50 hover:bg-slate-800 transition-all group/btn"
                            title="View Customer History"
                          >
                            <Phone className="w-3.5 h-3.5 text-slate-500 group-hover/btn:text-emerald-400" />
                            <span className="text-xs text-slate-300 group-hover/btn:text-emerald-400 font-medium">
                              {order.customerPhone}
                            </span>
                            <ExternalLink className="w-3 h-3 text-emerald-400 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                          </button>
                        )}
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 text-sm text-slate-400">{order.salesAgent}</td>
                    <td className="px-6 py-4"><StatusBadge status={order.status as OrderStatus} /></td>
                    <td className="px-6 py-4 text-left font-medium text-emerald-400 font-mono">
                        ${(order.orderAmount ?? 0).toLocaleString()}
                    </td>

                    {/* 4. ONLY SHOW PROFIT CELL IF ADMIN */}
                    {isAdmin && (
                        <td className="px-6 py-4 text-left font-medium text-green-400 font-mono">
                            ${(order.profit ?? 0).toLocaleString()}
                        </td>
                    )}
                  </motion.tr>
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