import {
  CheckCircle,
  Loader,
  Clock,
  XCircle,
  AlertCircle,
  Edit,
  Truck,
  Sparkles,
  LucideProps,
} from 'lucide-react';
import { OrderStatus } from '../types';

export interface StatusInfo {
  label: string;
  icon: React.FC<LucideProps>;
  color: string;
}

export const STATUS_INFO_MAP: Record<OrderStatus, StatusInfo> = {
  [OrderStatus.NEW_ORDER]: {
    label: 'New Order',
    icon: Sparkles,
    color: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  },
  [OrderStatus.AWAITING_APPROVAL]: {
    label: 'Awaiting Approval',
    icon: AlertCircle,
    color: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  },
  [OrderStatus.REVISION_REQUESTED]: {
    label: 'Revision Requested',
    icon: Edit,
    color: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  },
  [OrderStatus.APPROVED]: {
    label: 'Approved',
    icon: CheckCircle,
    color: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
  },
  [OrderStatus.IN_PRODUCTION]: {
    label: 'In Production',
    icon: Loader,
    color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  },
  [OrderStatus.COMPLETED]: {
    label: 'Completed',
    icon: CheckCircle,
    color: 'text-brand-green bg-brand-green/10 border-brand-green/20',
  },
  [OrderStatus.SHIPPED]: {
    label: 'Shipped',
    icon: Truck,
    color: 'text-green-400 bg-green-500/10 border-green-500/20',
  },
  [OrderStatus.CANCELLED]: {
    label: 'Cancelled',
    icon: XCircle,
    color: 'text-red-400 bg-red-500/10 border-red-500/20',
  },
  // Add other statuses if they exist in your OrderStatus enum
  [OrderStatus.DELIVERED]: { label: 'Delivered', icon: CheckCircle, color: 'text-lime-400 bg-lime-500/10 border-lime-500/20' },
  [OrderStatus.REFUNDED]: { label: 'Refunded', icon: XCircle, color: 'text-gray-400 bg-gray-500/10 border-gray-500/20' },
};

export const getStatusInfo = (status: OrderStatus | string): StatusInfo => {
  return STATUS_INFO_MAP[status as OrderStatus] || STATUS_INFO_MAP[OrderStatus.NEW_ORDER];
};