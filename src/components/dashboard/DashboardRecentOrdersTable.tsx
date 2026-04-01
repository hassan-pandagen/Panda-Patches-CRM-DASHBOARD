import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, ArrowRight, Calendar } from 'lucide-react';
import { Order, OrderStatus } from '../../types';
import StatusBadge from '../ui/StatusBadge';
import Skeleton from '../ui/Skeleton';

interface TableRowProps {
  order: Order;
}

const TableRow: React.FC<TableRowProps> = React.memo(({ order }) => {
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
      <td className="whitespace-nowrap px-6 py-4 font-mono text-brand-orange w-32 font-medium">
        {order.orderNumber}
      </td>
      <td className="whitespace-nowrap px-6 py-4 w-32 text-slate-400">
        {new Date(order.createdAt).toLocaleDateString()}
      </td>
      <td className="whitespace-nowrap px-6 py-4 font-medium text-white max-w-[180px] truncate" title={order.customerName}>
        {order.customerName}
      </td>
      <td className="whitespace-nowrap px-6 py-4 max-w-[200px] truncate text-slate-500" title={order.salesAgent}>
        {order.salesAgent}
      </td>
      <td className="whitespace-nowrap px-6 py-4 w-36">
        <StatusBadge status={order.status as OrderStatus} />
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-left font-bold text-emerald-400 w-32">
        ${(order.orderAmount || 0).toLocaleString()}
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-left font-medium w-28">
        {(order.amountRemaining ?? 0) <= 0.01 ? (
          <span className="inline-flex items-center gap-1 text-green-400">
            <CheckCircle className="w-4 h-4" />
            <span className="text-xs">Paid</span>
          </span>
        ) : (
          <span className="text-amber-400 font-bold">
            ${(order.amountRemaining ?? 0).toLocaleString()}
          </span>
        )}
      </td>
    </motion.tr>
  );
});

TableRow.displayName = 'TableRow';

/** Mobile card view for each order */
const MobileCard: React.FC<TableRowProps> = React.memo(({ order }) => {
  const navigate = useNavigate();

  return (
    <motion.div
      onClick={() => navigate(`/order/${order.orderNumber}`)}
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="p-4 border-b border-white/5 active:bg-white/5 cursor-pointer"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-white text-sm truncate">{order.customerName}</span>
            <StatusBadge status={order.status as OrderStatus} />
          </div>
          <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-400">
            <span className="font-mono text-brand-orange font-medium">{order.orderNumber}</span>
            <span>·</span>
            <Calendar className="w-3 h-3" />
            <span>{new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          </div>
          {order.salesAgent && (
            <p className="text-xs text-slate-500 mt-1 truncate">{order.salesAgent}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-sm font-bold text-emerald-400">${(order.orderAmount || 0).toLocaleString()}</span>
          {(order.amountRemaining ?? 0) <= 0.01 ? (
            <span className="inline-flex items-center gap-1 text-green-400 text-xs">
              <CheckCircle className="w-3 h-3" /> Paid
            </span>
          ) : (
            <span className="text-xs text-amber-400 font-medium">
              ${(order.amountRemaining ?? 0).toLocaleString()} pending
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
});

MobileCard.displayName = 'MobileCard';

const TableSkeleton: React.FC = () => (
  <tbody>
    {Array.from({ length: 5 }).map((_, i) => (
      <tr key={i} className="border-b border-slate-800">
        {Array.from({ length: 7 }).map((_, j) => (
          <td key={j} className="px-6 py-4"><Skeleton height={20} className="bg-slate-700/50" /></td>
        ))}
      </tr>
    ))}
  </tbody>
);

const MobileSkeleton: React.FC = () => (
  <div className="divide-y divide-white/5">
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="p-4 space-y-2">
        <div className="flex justify-between">
          <Skeleton width={140} height={18} />
          <Skeleton width={60} height={18} />
        </div>
        <Skeleton width={200} height={14} />
      </div>
    ))}
  </div>
);

interface DashboardRecentOrdersTableProps {
  orders: Order[];
  isLoading?: boolean;
  className?: string;
}

const DashboardRecentOrdersTable: React.FC<DashboardRecentOrdersTableProps> = ({
  orders,
  isLoading,
  className = ''
}) => {
  const headers = [
    { key: 'orderNumber', label: 'Order ID', width: 'w-32' },
    { key: 'createdAt', label: 'Date', width: 'w-32' },
    { key: 'customerName', label: 'Customer', width: 'w-auto' },
    { key: 'salesAgent', label: 'Sales Agent', width: 'w-auto' },
    { key: 'status', label: 'Status', width: 'w-36' },
    { key: 'orderAmount', label: 'Amount', width: 'w-32', align: 'left' },
    { key: 'amountRemaining', label: 'Pending', width: 'w-28', align: 'left' },
  ] as const;

  const displayOrders = orders.slice(0, 8);

  return (
    <div className={`relative group h-full ${className}`}>
      <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 via-cyan-500 to-sky-500 rounded-2xl opacity-20 blur-md group-hover:opacity-40 transition duration-1000" />

      <div className="relative h-full overflow-hidden rounded-2xl bg-slate-900/90 backdrop-blur-xl border border-white/10 shadow-2xl flex flex-col">

        {/* Desktop: Table view */}
        <div className="relative z-10 overflow-x-auto flex-grow custom-scrollbar hidden md:block">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-950/50 text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-white/10 sticky top-0 backdrop-blur-md z-20">
              <tr>
                {headers.map((header) => (
                  <th
                    key={header.key}
                    scope="col"
                    className={`px-6 py-4 ${header.width}`}
                  >
                    <div className={`flex items-center gap-2 ${header.align === 'right' ? 'justify-end' : 'justify-start'}`}>
                      {header.label}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {isLoading ? (
              <TableSkeleton />
            ) : (
              <tbody className="divide-y divide-white/5 bg-slate-900/20">
                {displayOrders.length === 0 ? (
                  <tr>
                      <td colSpan={7} className="text-center py-16">
                          <div className="flex flex-col items-center justify-center text-slate-500">
                              <p className="text-lg font-medium">No recent orders</p>
                              <p className="text-sm">New orders will appear here</p>
                          </div>
                      </td>
                  </tr>
                ) : (
                    displayOrders.map(order => (
                        <TableRow key={order.id} order={order} />
                    ))
                )}
              </tbody>
            )}
          </table>
        </div>

        {/* Mobile: Card view */}
        <div className="relative z-10 flex-grow overflow-y-auto custom-scrollbar md:hidden">
          {isLoading ? (
            <MobileSkeleton />
          ) : displayOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <p className="text-lg font-medium">No recent orders</p>
              <p className="text-sm">New orders will appear here</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {displayOrders.map(order => (
                <MobileCard key={order.id} order={order} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardRecentOrdersTable;
