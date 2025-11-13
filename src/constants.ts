// src/constants.ts
import {
  Clock,
  Truck,
  CheckCircle,
  XCircle,
  PauseCircle,
  Loader,
  type LucideIcon,
} from 'lucide-react';

/**
 * @fileoverview Centralized constants for the application.
 */

export const CRM_BASE_URL = import.meta.env.VITE_CRM_BASE_URL || 'https://mycustompatches.net';
export const SENDGRID_API_KEY = import.meta.env.VITE_SENDGRID_API_KEY || '';

// src/constants.ts
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Order statuses used throughout the application.
 * Matches the 'status' enum in the Supabase database.
 */
export const ORDER_STATUS = {
  PENDING: 'PENDING',
  IN_PRODUCTION: 'IN_PRODUCTION',
  COMPLETED: 'COMPLETED',
  SHIPPED: 'SHIPPED',
  CANCELLED: 'CANCELLED',
  ON_HOLD: 'ON_HOLD',
  NEW_ORDER: 'NEW_ORDER',
  AWAITING_CUSTOMER_APPROVAL: 'AWAITING_CUSTOMER_APPROVAL',
} as const;

export const QUERY_KEYS = {
  ORDERS: 'orders',
} as const;

// --- Mutable copies for FormSelect (fixes TS4104) ---
export const COURIER_OPTIONS: string[] = ['FedEx', 'DHL', 'UPS', 'Other'];
export const PATCHES_TYPE_OPTIONS: string[] = ['Embroidered', 'Woven', 'Chenille', 'PVC', 'Leather', 'Printed'];
export const DESIGN_BACKING_OPTIONS: string[] = ['Iron-on', 'Velcro', 'Adhesive', 'None'];
export const LEAD_SOURCE_OPTIONS: string[] = ['Facebook', 'Google', 'Referral', 'Repeat Customer', 'Other'];

// --- Status UI Mapping ---
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
    [ORDER_STATUS.PENDING]: {
      label: 'Pending',
      textColor: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/20',
      Icon: Clock,
    },
    [ORDER_STATUS.IN_PRODUCTION]: {
      label: 'In Production',
      textColor: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/20',
      Icon: Loader,
    },
    [ORDER_STATUS.COMPLETED]: {
      label: 'Completed',
      textColor: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/20',
      Icon: CheckCircle,
    },
    [ORDER_STATUS.SHIPPED]: {
      label: 'Shipped',
      textColor: 'text-green-400',
      bgColor: 'bg-green-500/10',
      borderColor: 'border-green-500/20',
      Icon: Truck,
    },
    [ORDER_STATUS.CANCELLED]: {
      label: 'Cancelled',
      textColor: 'text-rose-400',
      bgColor: 'bg-rose-500/10',
      borderColor: 'border-rose-500/20',
      Icon: XCircle,
    },
    [ORDER_STATUS.ON_HOLD]: {
      label: 'On Hold',
      textColor: 'text-orange-400',
      bgColor: 'bg-orange-500/10',
      borderColor: 'border-orange-500/20',
      Icon: PauseCircle,
    },
    [ORDER_STATUS.NEW_ORDER]: {
      label: 'New Order',
      textColor: 'text-sky-400',
      bgColor: 'bg-sky-500/10',
      borderColor: 'border-sky-500/20',
      Icon: Clock,
    },
    [ORDER_STATUS.AWAITING_CUSTOMER_APPROVAL]: {
      label: 'Awaiting Approval',
      textColor: 'text-yellow-400',
      bgColor: 'bg-yellow-500/10',
      borderColor: 'border-yellow-500/20',
      Icon: Loader,
    },

    // Extra fallbacks (from your dashboard)
    DELIVERED: {
      label: 'Delivered',
      textColor: 'text-teal-400',
      bgColor: 'bg-teal-500/10',
      borderColor: 'border-teal-500/20',
      Icon: CheckCircle,
    },
    REVISION_REQUESTED: {
      label: 'Revision Requested',
      textColor: 'text-orange-400',
      bgColor: 'bg-orange-500/10',
      borderColor: 'border-orange-500/20',
      Icon: Loader,
    },
    APPROVED: {
      label: 'Approved',
      textColor: 'text-lime-400',
      bgColor: 'bg-lime-500/10',
      borderColor: 'border-lime-500/20',
      Icon: CheckCircle,
    },
    SEND_FEEDBACK_EMAIL: {
      label: 'Feedback Sent',
      textColor: 'text-sky-400',
      bgColor: 'bg-sky-500/10',
      borderColor: 'border-sky-500/20',
      Icon: Clock,
    },
    DELAYED: {
      label: 'Delayed',
      textColor: 'text-red-400',
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/20',
      Icon: Clock,
    },
    REFUNDED: {
      label: 'Refunded',
      textColor: 'text-rose-500',
      bgColor: 'bg-rose-700/10',
      borderColor: 'border-rose-700/20',
      Icon: XCircle,
    },
  };

  const info = config[status] ?? config[ORDER_STATUS.PENDING];

  // Legacy support: old code uses `color` → map to `bgColor`
  return {
    ...info,
    color: info.bgColor, // ← keeps `config.color` working
  };
};