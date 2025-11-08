export enum OrderStatus {
  NEW_ORDER = 'NEW_ORDER',
  PENDING = 'PENDING',
  AWAITING_CUSTOMER_APPROVAL = 'AWAITING_CUSTOMER_APPROVAL',
  REVISION_REQUESTED = 'REVISION_REQUESTED',
  APPROVED = 'APPROVED',
  IN_PRODUCTION = 'IN_PRODUCTION',
  COMPLETED = 'COMPLETED',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  SEND_FEEDBACK_EMAIL = 'SEND_FEEDBACK_EMAIL',
  CANCELLED = 'CANCELLED',
  DELAYED = 'DELAYED',
  REFUNDED = 'REFUNDED',
}

export enum UserRole {
  ADMIN = 'ADMIN',
  SALES_AGENT = 'SALES_AGENT',
  AGENT = 'AGENT',
  PRODUCTION = 'PRODUCTION',
  QC_AGENT = 'QC_AGENT',
  ACCOUNTANT = 'ACCOUNTANT',
  DISPATCH_AGENT = 'DISPATCH_AGENT'
}

export interface UserAccess {
  dashboard: boolean;
  orders: boolean;
  revenue: boolean;
  sales_reports: boolean;
  production_reports: boolean;
  settings: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  role: UserRole;
  access?: UserAccess;
}

export interface Order {
  id: number;
  orderNumber: string;
  status: OrderStatus;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  shippingAddress?: string;
  designName: string;
  designSize?: string;
  designBacking?: string;
  patchesType?: string;
  patchesQuantity: number;
  revisionNotes?: string;
  customerAttachmentURLs?: string[];
  mockupURLs?: string[];
  redoNotes?: string;
  redoAttachments?: string[];
  instructions?: string;
  packing?: string;
  trackingNumber?: string;
  courier?: string;
  orderAmount: number;
  amountPaid: number;
  amountRemaining: number;
  salesAgent: string;
  is_urgent: boolean;
  is_urgent_approved: boolean;
  createdAt: string;
  updatedAt: string;
  created_by: string;
  leadSource?: string;
  customerProfileUrl?: string;
}

export interface OrderSummary {
  orderNumber: string;
  customerName: string;
  salesAgent: string;
  status: OrderStatus;
  orderAmount: number;
  createdAt: string;
  is_urgent: boolean;
}

export interface OrderHistoryEntry {
  id: number;
  order_id: number;
  user_email: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
}

export interface MonthlyCost {
  id: number;
  month_year: string;
  category: string;
  amount: number;
  notes?: string;
  added_by: string;
  created_at: string;
  updated_at: string;
}

export interface SalesReport {
  total_revenue: number;
  total_orders: number;
  total_collected: number;
  sales_by_agent: { [agentEmail: string]: number };
}

export interface StatusInfo {
  label: string;
  color: string;
  textColor: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface DateRange {
  startDate: string | null;
  endDate: string | null;
}

export interface IconProps {
  className?: string;
}