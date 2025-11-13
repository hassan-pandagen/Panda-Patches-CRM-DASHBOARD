import React from 'react';
import { OrderStatus } from '../types';

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<string, { color: string; label: string }> = {
    [OrderStatus.NEW_ORDER]: {
      color: "bg-sky-500/10 text-sky-400 border-sky-500/20",
      label: "New Order",
    },
    [OrderStatus.PENDING]: {
      color: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      label: "Pending",
    },
    [OrderStatus.IN_PRODUCTION]: {
      color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      label: "In Production",
    },
    [OrderStatus.COMPLETED]: {
      color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      label: "Completed",
    },
    [OrderStatus.SHIPPED]: {
      color: "bg-green-500/10 text-green-400 border-green-500/20",
      label: "Shipped",
    },
    [OrderStatus.CANCELLED]: {
      color: "bg-rose-500/10 text-rose-400 border-rose-500/20",
      label: "Cancelled",
    },
  };

  const s = config[status] || config[OrderStatus.PENDING];
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${s.color}`}>
      {s.label}
    </span>
  );
};

export default StatusBadge;