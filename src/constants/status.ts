import {
  Clock,
  Truck,
  CheckCircle,
  XCircle,
  PauseCircle,
  Loader,
  type LucideIcon,
} from 'lucide-react';
import { OrderStatus } from '../types';

export type StatusInfo = {
  label: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
  Icon: LucideIcon;
  /** Legacy field — kept for backward compatibility with old badge code */
  color?: string;
};

/**
 * Get full UI config for a status.
 * Used in badges, tables, production pipeline, etc.
 */
export const getStatusInfo = (status: string): StatusInfo => {
  const config: Record<string, StatusInfo> = {
    [OrderStatus.PENDING]: {
      label: 'Pending',
      textColor: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/20',
      Icon: Clock,
    },
    [OrderStatus.IN_PRODUCTION]: {
      label: 'In Production',
      textColor: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/20',
      Icon: Loader,
    },
    [OrderStatus.COMPLETED]: {
      label: 'Completed',
      textColor: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/20',
      Icon: CheckCircle,
    },
    [OrderStatus.SHIPPED]: {
      label: 'Shipped',
      textColor: 'text-green-400',
      bgColor: 'bg-green-500/10',
      borderColor: 'border-green-500/20',
      Icon: Truck,
    },
    [OrderStatus.CANCELLED]: {
      label: 'Cancelled',
      textColor: 'text-rose-400',
      bgColor: 'bg-rose-500/10',
      borderColor: 'border-rose-500/20',
      Icon: XCircle,
    },
    // ON_HOLD is not in the enum, but is in the original constants file. Keeping for safety.
    ['ON_HOLD']: {
      label: 'On Hold',
      textColor: 'text-orange-400',
      bgColor: 'bg-orange-500/10',
      borderColor: 'border-orange-500/20',
      Icon: PauseCircle,
    },
    [OrderStatus.NEW_ORDER]: {
      label: 'New Order',
      textColor: 'text-sky-400',
      bgColor: 'bg-sky-500/10',
      borderColor: 'border-sky-500/20',
      Icon: Clock,
    },
    [OrderStatus.AWAITING_APPROVAL]: {
      label: 'Awaiting Approval',
      textColor: 'text-yellow-400',
      bgColor: 'bg-yellow-500/10',
      borderColor: 'border-yellow-500/20',
      Icon: Loader,
    },
    [OrderStatus.DELIVERED]: {
      label: 'Delivered',
      textColor: 'text-teal-400',
      bgColor: 'bg-teal-500/10',
      borderColor: 'border-teal-500/20',
      Icon: CheckCircle,
    },
    [OrderStatus.REVISION_REQUESTED]: {
      label: 'Revision Requested',
      textColor: 'text-orange-400',
      bgColor: 'bg-orange-500/10',
      borderColor: 'border-orange-500/20',
      Icon: Loader,
    },
    [OrderStatus.APPROVED]: {
      label: 'Approved',
      textColor: 'text-lime-400',
      bgColor: 'bg-lime-500/10',
      borderColor: 'border-lime-500/20',
      Icon: CheckCircle,
    },
    [OrderStatus.REFUNDED]: {
      label: 'Refunded',
      textColor: 'text-rose-500',
      bgColor: 'bg-rose-700/10',
      borderColor: 'border-rose-700/20',
      Icon: XCircle,
    },
  };

  const info = config[status] ?? config[OrderStatus.PENDING];

  // Legacy support: old code uses `color` → map to `bgColor`
  return {
    ...info,
    color: info.bgColor, // ← keeps `config.color` working
  };
};