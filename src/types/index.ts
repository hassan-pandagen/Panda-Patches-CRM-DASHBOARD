// src/types/index.ts - FINAL, COMPREHensive, & ORGANIZED

// --- Global Application Settings ---
export interface GlobalSettings {
  id: string;
  logo_url?: string;
  company_name?: string;
  [key: string]: any; // Allow for extensibility
}

export enum UserRole {
  ADMIN = 'ADMIN',
  SALES_AGENT = 'SALES_AGENT',
  PRODUCTION = 'PRODUCTION',
}

export enum OrderStatus {
  NEW_ORDER = 'NEW_ORDER',
  REVISION_REQUESTED = 'REVISION_REQUESTED',
  AWAITING_APPROVAL = 'AWAITING_CUSTOMER_APPROVAL',
  APPROVED = 'APPROVED',
  IN_PRODUCTION = 'IN_PRODUCTION',
  QUALITY_ASSURANCE = 'QUALITY_ASSURANCE',
  REMAKE = 'REMAKE',
  COMPLETED = 'COMPLETED',
  SHIPPED = 'SHIPPED',
  CANCELLED = 'CANCELLED',
  DELIVERED = 'DELIVERED',
  REFUNDED = 'REFUNDED',
  FEEDBACK = 'FEEDBACK'
}

// --- User Permissions Enum ---
export enum Permissions {
  USERS_MANAGE = 'users_manage',
  ORDERS_CREATE = 'orders_create',
  ORDERS_VIEW_ALL = 'orders_view_all',
  ORDERS_VIEW_OWN_ONLY = 'orders_view_own_only',
  ORDERS_CHANGE_STATUS = 'orders_change_status',
  ORDERS_EDIT_FINANCIALS = 'orders_edit_financials',
  ORDERS_EDIT_PRODUCTION = 'orders_edit_production',
  ORDERS_DELETE = 'orders_delete',
  REPORTS_VIEW_FINANCIALS = 'reports_view_financials',
  SHIPPING_VIEW = 'shipping_view',
  ATTENDANCE_CLOCK_ONLY = 'attendance_clock_only'
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
  ccEmail?: string; // Secondary/CC email for companies with multiple contacts
  customerPhone?: string;
  customerProfileUrl?: string;

  // --- Design & Production Details ---
  designName?: string;
  patchesQuantity?: number;
  designSize?: string;
  patchesType?: string;
  designBacking?: string;
  borderType?: string;
  instructions?: string;
  isUrgent: boolean;
  isUrgentApproved?: boolean;
  rushDate?: string; // Required ship-by date when order is marked urgent

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
  assignedBy?: string; // Email of admin who assigned this order
  assignedAt?: string; // Timestamp when order was assigned

  // --- Geography ---
  country?: string | null; // Shipping country, fixed dropdown — see COUNTRY_OPTIONS

  // --- Marketing Attribution (for Meta CAPI etc.) ---
  attribution: Record<string, unknown> | null;

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
  orders_view_own_only?: boolean;
  orders_change_status?: boolean;
  orders_edit_financials?: boolean;
  orders_edit_production?: boolean;
  orders_delete?: boolean;
  reports_view_financials?: boolean;
  shipping_view?: boolean;
  attendance_clock_only?: boolean;
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

export interface AttendanceSession {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  clock_in_time: string; // ISO 8601 timestamp
  clock_out_time: string | null; // ISO 8601 timestamp or null
  duration_hours: number;
  work_date: string; // YYYY-MM-DD
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

// --- QUOTE TYPE ---
export interface Quote {
   // --- Core Quote Details ---
   id: number;
   quoteNumber: string;
   createdAt: string;
   updatedAt: string;
   
   // --- Customer Information ---
   customerName: string;
   customerEmail: string;
   ccEmail?: string; // Secondary/CC email for companies with multiple contacts
   customerPhone?: string;
   customerProfileUrl?: string;

   // --- Design & Production Details ---
   designName?: string;
   patchesQuantity?: number;
   patchesType?: string;
   designSize?: string;
   designBacking?: string;
   instructions?: string;

   // --- Financials ---
   estimatedAmount?: number;

   // --- Personnel & Sourcing ---
   salesAgent: string;
   leadSource?: string;

   // --- Marketing Attribution (for Meta CAPI etc.) ---
   attribution: Record<string, unknown> | null;

   // --- Meta Messenger / Instagram chat (snake_case to match DB column names) ---
   meta_psid?: string | null;
   meta_ig_id?: string | null;
   meta_channel?: 'messenger' | 'instagram' | null;
   meta_first_message_at?: string | null;
   meta_ad_id?: string | null;
   meta_ad_creative_id?: string | null;
   meta_ctwa_clid?: string | null;
   meta_referral_source?: string | null;

   // --- Notes & Attachments ---
   notes?: string;
   mockupUrls?: string[];
   customerAttachmentUrls?: string[];

   // --- Email Tracking ---
   emailSentAt?: string | null; // Timestamp of when quote email was sent to customer
}

// --- MONTHLY COSTS TYPE ---
// --- ORDER NOTES / CUSTOMER FEEDBACK ---
export type NoteType = 'quality_feedback' | 'customer_call' | 'complaint' | 'general';

export interface OrderNote {
  id: number;
  orderId: number;
  userId: string;
  userEmail: string;
  userName: string;
  noteType: NoteType;
  content: string;
  rating: number | null; // 1-5 star rating for quality feedback
  createdAt: string;
}

// --- FORM FEEDBACK (from portal quote forms) ---
export type FormFeedbackRating = 'easy' | 'okay' | 'difficult';
export type FormFeedbackType = 'hero_quote' | 'bulk_quote' | 'calculator_quote';

export interface FormFeedback {
  id: string;
  formType: FormFeedbackType;
  rating: FormFeedbackRating;
  comment: string | null;
  pageUrl: string;
  createdAt: string;
}

export interface MonthlyCost {
  id: number;
  monthYear: string; // Format: "YYYY-MM" (e.g., "2026-01")
  category: string;
  amount: number;
  notes: string | null;
  addedBy: string | null;
  createdAt: string;
  updatedAt: string;
}
