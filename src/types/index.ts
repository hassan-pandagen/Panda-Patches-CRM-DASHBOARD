// src/types/index.ts - FINAL, COMPREHensive, & ORGANIZED

export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER'
}

export enum OrderStatus {
  NEW_ORDER = 'NEW_ORDER',
  REVISION_REQUESTED = 'REVISION_REQUESTED',
  AWAITING_APPROVAL = 'AWAITING_CUSTOMER_APPROVAL',
  APPROVED = 'APPROVED',
  IN_PRODUCTION = 'IN_PRODUCTION',
  QUALITY_ASSURANCE = 'QUALITY_ASSURANCE',
  COMPLETED = 'COMPLETED',
  SHIPPED = 'SHIPPED',
  CANCELLED = 'CANCELLED',
  DELIVERED = 'DELIVERED',
  REFUNDED = 'REFUNDED',
  FEEDBACK = 'FEEDBACK'
}

export interface Order {
  // --- Core Order Details ---
  id: number;
  orderNumber: string;
  createdAt: string; // Comes as an ISO string from Supabase
  updatedAt: string;
  status: OrderStatus | string;
  reasonCategory?: string;
  reasonDetails?: string;
  
  // --- Customer Information ---
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerProfileUrl?: string;

  // --- Design & Production Details ---
  designName?: string;
  patchesQuantity?: number;
  designSize?: string;
  patchesType?: string;
  designBacking?: string;
  instructions?: string;
  isUrgent: boolean;
  isUrgentApproved?: boolean;

  // --- Financials ---
  orderAmount: number | null;
  amountPaid: number | null;
  amountRemaining: number | null;
  productionCost: number | null;
  shippingCost: number | null;
  marketingCost: number | null;
  profit: number | null;
  originalAmount?: number;

  // --- Personnel & Sourcing ---
  salesAgent: string;
  leadSource?: string;

  // --- Notes & Attachments (Arrays of URLs) ---
  revisionNotes?: string;
  redoNotes?: string;
  productionFileUrls?: string[];
  shippingAttachmentUrls?: string[];
  customerAttachmentUrls?: string[];
  mockupUrls?: string[];
  redoAttachments?: string[];

  // --- Shipping ---
  shippingAddress?: string;
  shippingTrackingNumber?: string;
  shippingCarrier?: string;
}

export type UserPermissions = {
  [key: string]: boolean;
  users_manage?: boolean;
  orders_create?: boolean;
  orders_view_all?: boolean;
  orders_change_status?: boolean;
  orders_edit_financials?: boolean;
  orders_edit_production?: boolean;
  orders_delete?: boolean;
  reports_view_financials?: boolean;
  shipping_view?: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  permissions: UserPermissions;
}

export interface OrderCommunication {
  id: number;
  orderId: number;
  userId: string;
  userEmail: string;
  recipientEmail: string;
  subject: string;
  body: string;
  templateId?: string;
  visibility: 'internal' | 'customer';
  sentAt: string;
}

export interface OrderHistoryEntry {
  id: number;
  orderId: number;
  userEmail: string;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  changedAt: string; // ISO string
}

export interface OrderSummary {
  id: number;
  orderNumber: string;
  customerName: string;
  status: string;
  createdAt: string;
  isUrgent?: boolean;
  salesAgent?: string;
  orderAmount?: number;
  amountRemaining?: number;
}
