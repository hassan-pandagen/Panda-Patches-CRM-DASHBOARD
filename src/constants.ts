import { OrderStatus } from "./types";

export const N8N_WEBHOOK_URL = process.env.REACT_APP_N8N_WEBHOOK_URL || 'YOUR_N8N_WEBHOOK_URL_HERE';
export const N8N_APPROVAL_WEBHOOK_URL = process.env.REACT_APP_N8N_APPROVAL_WEBHOOK_URL || 'YOUR_N8N_APPROVAL_WEBHOOK_URL_HERE';
export const CRM_BASE_URL = process.env.REACT_APP_CRM_BASE_URL || 'http://localhost:3000';

export const DESIGN_BACKING_OPTIONS = ['Iron-on', 'Velcro', 'Adhesive', 'None'];
export const PATCHES_TYPE_OPTIONS = ['Embroidered', 'Woven', 'PVC', 'Chenille', 'Printed'];
export const COURIER_OPTIONS = ['FedEx', 'DHL', 'UPS', 'Other'];

const STATUS_INFO_MAP: Record<OrderStatus, { label: string; color: string; textColor: string; }> = {
    [OrderStatus.NEW_ORDER]: { label: 'New Order', color: 'bg-sky-500/10', textColor: 'text-sky-400' },
    [OrderStatus.PENDING]: { label: 'Pending', color: 'bg-amber-500/10', textColor: 'text-amber-400' },
    [OrderStatus.IN_PROGRESS]: { label: 'In Progress', color: 'bg-blue-500/10', textColor: 'text-blue-400' },
    [OrderStatus.AWAITING_CUSTOMER_APPROVAL]: { label: 'Awaiting Approval', color: 'bg-yellow-500/10', textColor: 'text-yellow-400' },
    [OrderStatus.REVISION_REQUESTED]: { label: 'Revision Requested', color: 'bg-orange-500/10', textColor: 'text-orange-400' },
    [OrderStatus.APPROVED]: { label: 'Approved', color: 'bg-lime-500/10', textColor: 'text-lime-400' },
    [OrderStatus.IN_PRODUCTION]: { label: 'In Production', color: 'bg-blue-500/10', textColor: 'text-blue-400' },
    [OrderStatus.COMPLETED]: { label: 'Completed', color: 'bg-emerald-500/10', textColor: 'text-emerald-400' },
    [OrderStatus.SHIPPED]: { label: 'Shipped', color: 'bg-green-500/10', textColor: 'text-green-400' },
    [OrderStatus.DELIVERED]: { label: 'Delivered', color: 'bg-teal-500/10', textColor: 'text-teal-400' },
    [OrderStatus.SEND_FEEDBACK_EMAIL]: { label: 'Feedback Sent', color: 'bg-sky-500/10', textColor: 'text-sky-400' },
    [OrderStatus.CANCELLED]: { label: 'Cancelled', color: 'bg-rose-500/10', textColor: 'text-rose-400' },
    [OrderStatus.DELAYED]: { label: 'Delayed', color: 'bg-red-500/10', textColor: 'text-red-400' },
    [OrderStatus.REFUNDED]: { label: 'Refunded', color: 'bg-rose-700/10', textColor: 'text-rose-500' },
};

export const getStatusInfo = (status: OrderStatus) => STATUS_INFO_MAP[status] || STATUS_INFO_MAP.PENDING;

export {}; // This ensures the file is treated as a module.

export {}; // This ensures the file is treated as a module.