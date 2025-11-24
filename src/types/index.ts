// src/types/index.ts - FINAL, COMPREHensive, & ORGANIZED

// ===================================================================
// ENUMS & CONSTANTS
// Central definitions for application-wide roles and statuses.
// ===================================================================

export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER'
}

export enum OrderStatus {
  NEW_ORDER = 'NEW_ORDER',
  PENDING = 'PENDING', // A common alias for NEW_ORDER or AWAITING_APPROVAL
  REVISION_REQUESTED = 'REVISION_REQUESTED',
  AWAITING_APPROVAL = 'AWAITING_CUSTOMER_APPROVAL',
  APPROVED = 'APPROVED',
  IN_PRODUCTION = 'IN_PRODUCTION',
  COMPLETED = 'COMPLETED',
  SHIPPED = 'SHIPPED',
  CANCELLED = 'CANCELLED',
  DELIVERED = 'DELIVERED',
  REFUNDED = 'REFUNDED',
}

export enum UserAccess {
  // Page/Feature Access
  DASHBOARD = 'dashboard',
  ORDERS = 'orders',
  REVENUE = 'revenue',
  SALES_REPORTS = 'sales_reports',
  PRODUCTION_REPORTS = 'production_reports',
  SETTINGS = 'settings',
  // Action-based Permissions
  CAN_VIEW_REPORTS = 'CAN_VIEW_REPORTS',
  CAN_MANAGE_USERS = 'CAN_MANAGE_USERS',
  CAN_VIEW_PROFIT_LOSS = 'CAN_VIEW_PROFIT_LOSS',
  CAN_DELETE_ORDERS = 'CAN_DELETE_ORDERS',
}

// ===================================================================
// CORE DATA INTERFACES
// The primary data structures used throughout the application.
// ===================================================================

export interface Order {
  // --- Core Order Details ---
  id: number;
  orderNumber: string;
  createdAt: string; // Comes as an ISO string from Supabase
  updatedAt: string;
  status: OrderStatus | string; // Use enum but allow string for flexibility
  
  // ✅ NEW FIELDS
  reasonCategory?: string;
  reasonDetails?: string;
  
  // --- Customer Information ---
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerProfileUrl?: string;

  // --- Design & Production Details ---
  designName?: string;
  patchesQuantity?: number; // <<-- FIX: Added missing property
  designSize?: string;      // <<-- FIX: Added missing property
  patchesType?: string;
  designBacking?: string;
  instructions?: string;
  isUrgent: boolean;
  isUrgentApproved?: boolean;

  // --- Financials ---
  orderAmount: number;
  amountPaid: number;
  amountRemaining: number;
  productionCost: number;
  shippingCost: number;
  marketingCost: number;
  profit: number;

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
}

// --- FIX: Add missing shipping properties to the Order interface ---
export interface Order extends OrderBase {
  shippingAddress?: string;
  shippingTrackingNumber?: string;
  shippingCarrier?: string;
}

export interface UserPermissions {
  can_manage_users: boolean;
  view_financials: boolean;
  view_production: boolean;
  view_shipping: boolean;
  can_delete_orders: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole; // ✅ Enforced Enum (Instead of string)
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

// ===================================================================
// SUBSET & UTILITY TYPES
// Lighter versions of core interfaces for specific use cases like summaries.
// ===================================================================

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
