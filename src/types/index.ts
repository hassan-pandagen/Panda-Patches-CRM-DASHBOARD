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
  SHIPPING = 'SHIPPING',
  // Added Task 1.1 (digitizer-portal brief). Adding a role means THREE places, together:
  //   1. this enum
  //   2. the CHECK constraint on user_profiles.role
  //   3. the allowlists in src/utils/roleAccess.ts
  // Miss (3) and the role gets nothing — safe. Miss (2) and it cannot be saved — safe.
  // The lists in roleAccess.ts are where the actual decision lives.
  DIGITIZER = 'DIGITIZER',
  PRODUCTION_SUPERVISOR = 'PRODUCTION_SUPERVISOR',
}

export enum OrderStatus {
  // Held state for "wait for payment" orders (Add Order / Re-order flow): the order exists
  // and is tracked, but is NOT released to production until Square confirms payment. Excluded
  // from the production queue/board; flipped to NEW_ORDER by the webhook once paid.
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  // Chenille letter/number packages have no mockup cycle — the colour match IS the approval
  // step. An armed order waits here until a supervisor records the yarn. The DB trigger
  // guard_colour_match_before_production blocks IN_PRODUCTION regardless of status, so this
  // is the visible half of the gate, not the gate itself.
  COLOUR_MATCH_PENDING = 'COLOUR_MATCH_PENDING',
  NEW_ORDER = 'NEW_ORDER',
  REVISION_REQUESTED = 'REVISION_REQUESTED',
  AWAITING_APPROVAL = 'AWAITING_CUSTOMER_APPROVAL',
  // Waiting on the customer to receive and sign off a physical sample. Sits beside
  // AWAITING_CUSTOMER_APPROVAL because both are "the ball is with the customer" —
  // the difference is a sample in the post rather than a mockup on screen.
  AWAITING_SAMPLE = 'AWAITING_SAMPLE',
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
  legacyCustomerRef?: string | null; // CL0FAA §3: pre-migration customer-facing number, for search only
  createdAt: string; // Comes as an ISO string from Supabase
  updatedAt: string;
  status: OrderStatus | string;
  reasonCategory?: string;
  reasonDetails?: string;
  isWebCheckout?: boolean; // Durable self-serve web-checkout origin; survives agent reassignment

  // --- Customer Information ---
  customerName: string;
  customerEmail: string;
  ccEmail?: string; // Secondary/CC email for companies with multiple contacts
  customerPhone?: string;
  customerProfileUrl?: string;
  organization?: string; // Company / end client the order is FOR (searchable); distinct from customerName
  orderChannel?: string | null;    // 'Direct' | 'Agency' — how the order reached us
  agencyName?: string | null;      // agency/distributor name when orderChannel = 'Agency'
  endClientConfidential?: boolean; // white-label: end client must NOT be named publicly
  deliveredAt?: string | null;     // observed OR estimated delivery timestamp
  deliveredAtEstimated?: boolean;  // true = delivered_at is an estimate (bulk-close), not observed
  purchaseOrder?: string; // Customer PO number/reference — searchable

  // --- Design & Production Details ---
  designName?: string;
  patchesQuantity?: number;
  designSize?: string;
  patchesType?: string;
  designBacking?: string;
  borderType?: string;
  instructions?: string;
  // --- Colour match (chenille letter packages) ---
  colourMatchRequired?: boolean;
  colourMatchStatus?: 'standard' | 'needs-customer-confirmation' | null;
  customerColourInput?: string | null;  // verbatim — never normalised
  customerColourHex?: string | null;    // parsed only when the input was a hex
  matchedYarn?: string | null;          // empty blocks IN_PRODUCTION (DB trigger)
  colourProposedYarn?: string | null;   // supervisor's closest match — NOT the gate
  colourConfirmToken?: string | null;
  colourEmailSentAt?: string | null;
  colourReminderSentAt?: string | null;
  colourFollowupFlaggedAt?: string | null;
  colourCustomerResponse?: 'approved' | 'changes_requested' | null;
  colourCustomerRespondedAt?: string | null;
  // Loyalty program (CL86F1)
  priorityMockup?: boolean;
  loyaltyCodeUsed?: string | null;
  loyaltyDiscountPercent?: number | null;
  isUrgent: boolean;
  isUrgentApproved?: boolean;
  rushDate?: string; // Required ship-by date when order is marked urgent
  shipByDate?: string | null; // Soft ship-by reminder date (independent of urgent)
  sampleBox?: boolean; // Customer also wants a sample box alongside their patches

  // --- Production completion (separate from status; production team flag) ---
  productionCompletedAt?: string | null;
  productionCompletedBy?: string | null;
  productionCompletionPhotos?: string[]; // "completion packet" photos of the finished product

  // --- Financials ---
  orderAmount: number | null;
  amountPaid: number | null;
  amountRemaining: number | null;
  productionCost: number | null;
  shippingCost: number | null;
  marketingCost: number | null;
  profit: number | null;
  originalAmount?: number;
  paidInvoiceSentAt?: string | null; // CL0FAA §2: set once the auto PAID-invoice email has been sent

  // --- Personnel & Sourcing ---
  salesAgent: string;
  leadSource?: string;
  assignedBy?: string; // Email of admin who assigned this order
  assignedAt?: string; // Timestamp when order was assigned

  // --- Geography ---
  country?: string | null; // Shipping country, fixed dropdown — see COUNTRY_OPTIONS

  // --- Marketing Attribution (for Meta CAPI etc.) ---
  attribution: Record<string, unknown> | null;
  attributionQuality?: 'tracked' | 'partial' | 'untracked' | null; // DB-generated column

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
  shipCity?: string;
  shipState?: string;
  shipPostal?: string;
  shippingTrackingNumber?: string;
  shippingCarrier?: string;
}

export type UserPermissions = {
  // Optional named perms are `boolean | undefined`, so the index signature must allow
  // undefined too — otherwise every optional key below is a TS2411 conflict (11 errors).
  [key: string]: boolean | undefined;
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

// NOTE: these two mirror their DB tables (order_communications / order_history) and are
// read straight from `select('*')` with no camelCase mapping — so the fields are snake_case
// to match the actual runtime shape (previously camelCase, which lied and caused 21 TS errors).
export interface OrderCommunication {
  id: number;
  order_id?: number;
  user_id?: string;
  user_email: string | null;
  recipient_email: string;
  subject: string;
  body?: string;
  template_id?: string;
  visibility?: 'internal' | 'customer';
  sent_at: string;
}

export interface OrderHistoryEntry {
  id: number;
  order_id: number;
  user_email: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string; // ISO string
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
  auto_clocked_out?: boolean;
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
   organization?: string; // Company / end client the order is FOR (searchable); distinct from customerName
  orderChannel?: string | null;    // 'Direct' | 'Agency' — how the order reached us
  agencyName?: string | null;      // agency/distributor name when orderChannel = 'Agency'
  endClientConfidential?: boolean; // white-label: end client must NOT be named publicly
  deliveredAt?: string | null;     // observed OR estimated delivery timestamp
  deliveredAtEstimated?: boolean;  // true = delivered_at is an estimate (bulk-close), not observed
   shippingAddress?: string;
   shipCity?: string;
   shipState?: string;
   shipPostal?: string;

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
