// src/components/orders/OrderForm.tsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import LoyaltyOrderPanel from './LoyaltyOrderPanel';
import { useAuth } from '../../contexts/AuthContext';
import { Order, OrderStatus, UserRole } from '../../types';
import Button from '../ui/Button';
import { useToast } from '../../hooks/useToast';
import Spinner from '../ui/Spinner';
import FileUploadSection from './FileUpload'; 
import Textarea from '../ui/Textarea'; 
import { LEAD_SOURCE_OPTIONS, PATCHES_TYPE_OPTIONS, COUNTRY_OPTIONS, DESIGN_BACKING_OPTIONS } from '../../constants/index';
import { supabase } from '../../services/supabaseClient';
import { logger } from '../../services/logger';
import { getPremiumStatus, setPremiumStatus } from '../../services/customerFlagsService';
import { getCustomerByEmail, Customer } from '../../services/customersService';
import { sanitizeOrFilterValue, sanitizeIlikePattern } from '../../utils/supabaseFilters';
import { History, UserCheck, ExternalLink, Copy, FileText, AlertTriangle, Crown, BadgeCheck, DollarSign } from 'lucide-react';
import MarkAsPaidModal from './MarkAsPaidModal';

const CANCELLATION_REASONS = [
  "Customer Ghosted / No Reply",
  "Changed Mind",
  "Price Too High",
  "Duplicate Order",
  "Copyright / Policy Violation",
  "Other"
];

const REFUND_REASONS = [
  "Production Defect / Quality Issue",
  "Shipping Lost / Damaged",
  "Late Delivery",
  "Design Mismatch",
  "Customer Error",
  "Other"
];

const REMAKE_REASONS = [
  "Package Lost",
  "Quality Issues",
  "Handling Issues",
  "Force Majeure"
];

const FormSectionWrapper: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="group relative bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl p-10">
    <h3 className="relative text-lg font-semibold text-white pb-2 mb-10">
      {title}
      <div className="absolute bottom-0 left-0 h-px w-0 bg-gradient-to-r from-brand-orange to-orange-500 transition-all duration-300 group-hover:w-full" />
    </h3>
      {children}
  </div>
);

export interface SaveData {
  customerName: string;
  customerEmail: string;
  ccEmail?: string;
  customerPhone?: string;
  customerProfileUrl?: string;
  // Optional buying organization (self-identified). Distinct from customerName (the individual).
  organization?: string;
  purchaseOrder?: string;
  shippingAddress?: string;
  // Structured shipping location (clean geo data for analytics/metro reporting).
  // shippingAddress stays the full free-text address; these are the parsed parts.
  shipCity?: string;
  shipState?: string;
  shipPostal?: string;
  designName?: string;
  patchesQuantity: number;
  patchesType?: string;
  designSize?: string;
  designBacking?: string;
  borderType?: string;
  instructions?: string;
  orderAmount: number;
  amountPaid: number;
  productionCost: number;
  shippingCost: number;
  marketingCost: number;
  leadSource?: string;
  country?: string;
  status: string;
  isUrgent: boolean;
  rushDate?: string;
  // Soft ship-by reminder date — independent of isUrgent; drives a pill, not the urgent workflow.
  shipByDate?: string | null;
  sampleBox?: boolean;
  shippingCarrier?: string;
  shippingTrackingNumber?: string;
  // Files as simple string arrays
  mockupUrls?: string[];
  productionFileUrls?: string[];
  shippingAttachmentUrls?: string[];
  customerAttachmentUrls?: string[];
  // ✅ Add these
  reasonCategory: string;
  reasonDetails: string;
  // Loyalty program (CL86F1) — recorded when the agent applies a code; does not change orderAmount.
  loyaltyCodeUsed?: string | null;
  loyaltyDiscountPercent?: number | null;
}

export interface ChangeDetail {
  field: keyof SaveData;
  oldValue: any;
  newValue: any;
}

interface OrderFormProps {
  onSave: (data: { current: SaveData, isNew: boolean, changes: ChangeDetail[] }) => void;
  initialData?: Order | null;
  isSaving?: boolean;
  showFinancials?: boolean;
  isNewOrder?: boolean; // Add this prop
  onFormChange?: () => void; // Callback when form data changes
}

interface ExistingCustomerInfo {
  count: number;
  lastOrder: string;
  // Auto-fill data
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerProfileUrl?: string;
  shippingAddress?: string;
  ccEmail?: string;
}


// TRANSFORM: Convert DB data to Form Data
const transformOrderToFormData = (order: Order | null | undefined): SaveData => {
  // ✅ LAYER 1: Guarantee valid initial state
  if (!order) {
    // Creating a NEW order - provide sensible defaults
    return {
      // Required fields
      customerName: '',
      customerEmail: '',
      customerPhone: '',
      customerProfileUrl: '',
      organization: '',
      purchaseOrder: '',
      
      // ✅ CRITICAL: Status always has default value
      status: OrderStatus.NEW_ORDER,  // NEVER undefined
      
      // Product details
      designName: '',
      patchesQuantity: 0,
      patchesType: '',
      designSize: '',
      designBacking: '',
      instructions: '',
      
      // Shipping
      shippingAddress: '',
      shipCity: '',
      shipState: '',
      shipPostal: '',
      shippingCarrier: '',
      shippingTrackingNumber: '',
      
      // Financials
      orderAmount: 0,
      amountPaid: 0,
      productionCost: 0,
      shippingCost: 0,
      marketingCost: 0,
      
      // Lead info
      leadSource: '',
      country: '',
      isUrgent: false,
      sampleBox: false,

      // Files
      mockupUrls: [],
      productionFileUrls: [],
      shippingAttachmentUrls: [],
      customerAttachmentUrls: [],
      
      // Reason fields
      reasonCategory: '',
      reasonDetails: '',
    } as SaveData;
  }

  // EDITING an order - use existing data with safe fallbacks
  return {
    ...order,
    
    // ✅ CRITICAL: Fallback for existing orders too
    status: order.status || OrderStatus.NEW_ORDER,
    
    patchesQuantity: order.patchesQuantity || 0,
    orderAmount: order.orderAmount || 0,
    amountPaid: order.amountPaid || 0,
    productionCost: order.productionCost || 0,
    shippingCost: order.shippingCost || 0,
    marketingCost: order.marketingCost || 0,
    loyaltyCodeUsed: order.loyaltyCodeUsed ?? null,
    loyaltyDiscountPercent: order.loyaltyDiscountPercent ?? null,
    
    // Ensure arrays are arrays
    mockupUrls: Array.isArray(order.mockupUrls) ? order.mockupUrls : [],
    productionFileUrls: Array.isArray(order.productionFileUrls) ? order.productionFileUrls : [],
    shippingAttachmentUrls: Array.isArray(order.shippingAttachmentUrls) ? order.shippingAttachmentUrls : [],
    customerAttachmentUrls: Array.isArray(order.customerAttachmentUrls) ? order.customerAttachmentUrls : [],
    
    reasonCategory: order.reasonCategory || '',
    reasonDetails: order.reasonDetails || '',
    country: order.country || '',
    organization: order.organization || '',
    shipCity: order.shipCity || '',
    shipState: order.shipState || '',
    shipPostal: order.shipPostal || '',
  };
};

const OrderForm: React.FC<OrderFormProps> = ({ 
  onSave, 
  initialData, 
  showFinancials: showFinancialsProp,
  isNewOrder = false,
  onFormChange
}) => {
  const { user, role, permissions } = useAuth();
  
  // ✅ FIX: Get toast methods directly
  const { success, error: showError } = useToast();

  const formDefaultValues = useMemo(() => ({
    // Start with the transformed data, which handles duplication logic
    ...transformOrderToFormData(initialData),
    // Then, GUARANTEE that all required/core fields have a safe default value.
    // This prevents "uncontrolled to controlled" errors in react-hook-form.
    status: initialData?.status || OrderStatus.NEW_ORDER,
    customerName: initialData?.customerName || '',
    customerEmail: initialData?.customerEmail || '',
    ccEmail: initialData?.ccEmail || '',
    patchesQuantity: initialData?.patchesQuantity || 1,
    orderAmount: initialData?.orderAmount || 0,
    amountPaid: initialData?.amountPaid || 0,
    productionCost: initialData?.productionCost || 0,
    shippingCost: initialData?.shippingCost || 0,
    marketingCost: initialData?.marketingCost || 0,
    isUrgent: initialData?.isUrgent || false,
    sampleBox: initialData?.sampleBox || false,
    rushDate: initialData?.rushDate || '',
    shipByDate: initialData?.shipByDate || '',
    mockupUrls: initialData?.mockupUrls || [],
    productionFileUrls: initialData?.productionFileUrls || [],
    shippingAttachmentUrls: initialData?.shippingAttachmentUrls || [],
    customerAttachmentUrls: initialData?.customerAttachmentUrls || [],
  }), [initialData]);

  // Ship-By reminder checkbox — reveals the (optional) date box. Purely UI; only shipByDate persists.
  const [showShipBy, setShowShipBy] = useState<boolean>(!!initialData?.shipByDate);
  // "Record payment" flow — reuses the atomic, audited record_manual_payment RPC (via MarkAsPaidModal)
  // instead of a raw amount_paid write from this form, so a payment landing while the form is open
  // can never be clobbered (PP-11151) and payment_status/paid_at/CAPI stay coherent.
  const [showRecordPayment, setShowRecordPayment] = useState<boolean>(false);

  // Internal state for the spinner, managed by the form itself.
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false); // Track if files are still uploading
  
  // ✅ State for live customer check
  const [existingCustomer, setExistingCustomer] = useState<ExistingCustomerInfo | null>(null);
  const [isCheckingCustomer, setIsCheckingCustomer] = useState(false);
  const [accountMatch, setAccountMatch] = useState<Customer | null>(null);
  // "Premium customer" tagging (CEO request: production applies extra QA/QC for these).
  // Auto-detected from an existing customer_flags row when a returning customer's email is
  // found; otherwise the agent can check it manually for a brand-new premium customer.
  const [isPremiumCustomer, setIsPremiumCustomer] = useState(false);
  const initialPremiumRef = React.useRef(false);
  // Live check: does this customer already have a quote in the system?
  // If yes, we nudge the agent to use Convert to Order on the quote instead of
  // creating a fresh order (preserves attribution, prevents data clutter).
  const [pendingQuote, setPendingQuote] = useState<{
    id: number;
    quote_number: string;
    customer_name: string | null;
    estimated_amount: number | null;
    created_at: string;
  } | null>(null);

  const { register, handleSubmit, watch, formState: { errors, isDirty }, reset, setValue } = useForm<SaveData>({
    defaultValues: formDefaultValues,
  });

  useEffect(() => {
    reset(transformOrderToFormData(initialData));
  }, [initialData, reset]);

  // ✅ Track form changes and notify parent (only call when explicitly user-modified, not on reset)
  useEffect(() => {
    if (isDirty && onFormChange) {
      onFormChange();
    }
  }, [isDirty, onFormChange]);

  // --- LIVE CUSTOMER CHECK ---
  const watchEmail = watch('customerEmail');
  const watchPhone = watch('customerPhone');

  useEffect(() => {
    const checkCustomer = async (identifier: string) => {
      if (!identifier || identifier.length < 5) {
        setExistingCustomer(null);
        return;
      }
      setIsCheckingCustomer(true);
      try {
        // Fetch customer details + count
        const safeId = sanitizeOrFilterValue(identifier);
        const { data, error, count } = await supabase
          .from('orders')
          .select('created_at, customer_name, customer_email, customer_phone, customer_profile_url, shipping_address, cc_email', { count: 'exact', head: false })
          .or(`customer_email.eq.${safeId},customer_phone.eq.${safeId}`)
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) throw error;

        if (count && count > 0 && data[0]) {
          const customerData = {
            count: count,
            lastOrder: new Date(data[0].created_at).toLocaleDateString(),
            customerName: data[0].customer_name,
            customerEmail: data[0].customer_email,
            customerPhone: data[0].customer_phone || '',
            customerProfileUrl: data[0].customer_profile_url || '',
            shippingAddress: data[0].shipping_address || '',
            ccEmail: data[0].cc_email || '',
          };

          setExistingCustomer(customerData);
          // No automatic fill - user clicks button to fill

          // Auto-detect Premium status from the customer's real email (not the raw
          // identifier, which may be a phone number the agent typed instead).
          if (customerData.customerEmail) {
            const flag = await getPremiumStatus(customerData.customerEmail);
            const isPremium = flag?.isPremium ?? false;
            initialPremiumRef.current = isPremium;
            setIsPremiumCustomer(isPremium);
          }
        } else {
          setExistingCustomer(null);
          initialPremiumRef.current = false;
          setIsPremiumCustomer(false);
        }
      } catch (err) {
        logger.error("Error checking customer:", err);
        setExistingCustomer(null);
      } finally {
        setIsCheckingCustomer(false);
      }
      };

    const handler = setTimeout(() => {
      const identifier = watchEmail || watchPhone;
      if (isNewOrder && identifier) {
        checkCustomer(identifier);
      }
    }, 750); // Debounce for 750ms

    return () => clearTimeout(handler);
  }, [watchEmail, watchPhone, isNewOrder, setValue, watch]);

  // --- CUSTOMER ACCOUNT LOOKUP (the curated `customers` master record, separate from the
  // raw order-history check above) — lets a new order auto-fill from the account's saved
  // details instead of just the latest order's snapshot. ---
  useEffect(() => {
    if (!isNewOrder || !watchEmail || watchEmail.trim().length < 5) {
      setAccountMatch(null);
      return;
    }
    const handler = setTimeout(async () => {
      try {
        const match = await getCustomerByEmail(watchEmail.trim());
        setAccountMatch(match);
      } catch (err) {
        logger.error('Error looking up customer account:', err);
        setAccountMatch(null);
      }
    }, 750);
    return () => clearTimeout(handler);
  }, [watchEmail, isNewOrder]);

  // --- LIVE QUOTE CHECK (separate from customer check) ---
  // If this email/phone has an open quote, nudge the agent to use Convert to Order
  // instead of creating a fresh order — preserves attribution + keeps data clean.
  useEffect(() => {
    if (!isNewOrder) {
      setPendingQuote(null);
      return;
    }
    const handler = setTimeout(async () => {
      const email = (watchEmail || '').trim();
      const phone = (watchPhone || '').trim();
      if (!email && !phone) {
        setPendingQuote(null);
        return;
      }
      try {
        let query = supabase
          .from('quotes')
          .select('id, quote_number, customer_name, estimated_amount, created_at')
          .order('created_at', { ascending: false })
          .limit(1);

        if (email && phone) {
          const safeEmail = sanitizeOrFilterValue(email);
          const safePhone = sanitizeOrFilterValue(phone);
          query = query.or(`customer_email.eq.${safeEmail},customer_phone.eq.${safePhone}`);
        } else if (email) {
          query = query.ilike('customer_email', sanitizeIlikePattern(email));
        } else if (phone) {
          query = query.eq('customer_phone', sanitizeOrFilterValue(phone));
        }

        const { data, error } = await query;
        if (error || !data || data.length === 0) {
          setPendingQuote(null);
          return;
        }
        setPendingQuote(data[0] as any);
      } catch {
        setPendingQuote(null);
      }
    }, 750);
    return () => clearTimeout(handler);
  }, [watchEmail, watchPhone, isNewOrder]);

  const onSubmit = async (data: SaveData) => {
    console.log('📝 Form submitted with data:', data);
    
    // ✅ CHECK: Prevent submission if files are still uploading
    if (isUploading) {
      showError('Please wait for all files to finish uploading before submitting.');
      return;
    }

    setIsSaving(true); // Start Spinner

    try {
      // The onSave function in the parent page handles saving the order.
      // The database trigger `log_order_changes` will automatically record the history.
      // The `data` object from the form contains all fields. We must ensure that only the fields
      // that exist in the 'orders' table are sent to the onSave function.
      // The `changes` array is no longer needed as the DB trigger handles history.
      const saveData = { ...data };
      await onSave({ current: saveData, isNew: isNewOrder, changes: [] });

      // Persist the Premium flag only after a successful save, and only when there's
      // something meaningful to write — skip the no-op "never premium, still unchecked"
      // case so customer_flags doesn't get a needless row for every ordinary new order.
      if (isNewOrder && data.customerEmail && (isPremiumCustomer || initialPremiumRef.current)) {
        setPremiumStatus(data.customerEmail, isPremiumCustomer, user?.email ?? 'unknown').catch((err) =>
          logger.error('Failed to save premium customer flag', err)
        );
      }
    } catch (err: any) {
      logger.error("💥 Save Error:", err);
      showError(err.message || 'Failed to save order. Please try again.');
    } finally {
      setIsSaving(false);
      // Reset the form with the new data to mark it as "not dirty"
      reset(data);
    }
  };

  // Manual copy customer info handler
  const handleCopyCustomerInfo = () => {
    if (!existingCustomer) return;

    // Fill all customer fields
    if (existingCustomer.customerName) {
      setValue('customerName', existingCustomer.customerName, { shouldDirty: true });
    }
    if (existingCustomer.customerEmail) {
      setValue('customerEmail', existingCustomer.customerEmail, { shouldDirty: true });
    }
    if (existingCustomer.customerPhone) {
      setValue('customerPhone', existingCustomer.customerPhone, { shouldDirty: true });
    }
    if (existingCustomer.customerProfileUrl) {
      setValue('customerProfileUrl', existingCustomer.customerProfileUrl, { shouldDirty: true });
    }
    if (existingCustomer.shippingAddress) {
      setValue('shippingAddress', existingCustomer.shippingAddress, { shouldDirty: true });
    }
    if (existingCustomer.ccEmail) {
      setValue('ccEmail', existingCustomer.ccEmail, { shouldDirty: true });
    }

    // Show success feedback
    success('Customer info copied!');
  };

  // Fill from the customer's saved account (the curated master record), not just their last order
  const handleUseAccountInfo = () => {
    if (!accountMatch) return;

    if (accountMatch.fullName) {
      setValue('customerName', accountMatch.fullName, { shouldDirty: true });
    }
    if (accountMatch.phone) {
      setValue('customerPhone', accountMatch.phone, { shouldDirty: true });
    }
    if (accountMatch.defaultShippingAddress) {
      setValue('shippingAddress', accountMatch.defaultShippingAddress, { shouldDirty: true });
    }

    success('Account info applied!');
  };

  // Determine if the user can edit financials.
  // This is used for the Edit Order page. The New Order page controls this with the `showFinancials` prop.
  const canEditFinancials =
    role === UserRole.ADMIN ||
    permissions?.orders_edit_financials === true;

  // Financial Calcs
  const orderAmount = watch('orderAmount', 0) || 0;
  const amountPaid = watch('amountPaid', 0) || 0;
  const productionCost = watch('productionCost', 0) || 0;
  const shippingCost = watch('shippingCost', 0) || 0;
  const marketingCost = watch('marketingCost', 0) || 0;
  const amountRemaining = orderAmount - amountPaid;
  const profit = orderAmount - (productionCost + shippingCost + marketingCost);
  const watchedStatus = watch('status');

  const patchTypes = PATCHES_TYPE_OPTIONS;
  const shippingCarriers = ["FedEx", "DHL", "UPS", "USPS", "Other"];
  const backingOptions = DESIGN_BACKING_OPTIONS;
  const watchedPatchType = watch('patchesType');
  const isDSTService = watchedPatchType === 'DST Service';

  // Auto-set quantity to 1 for DST Service (no physical quantity needed)
  useEffect(() => {
    if (isDSTService) {
      setValue('patchesQuantity', 1, { shouldDirty: false });
    }
  }, [isDSTService, setValue]);
  
  const orderNum = initialData?.orderNumber || 'new-order';
  
  // *** CRITICAL FIX: The exact bucket name from your Supabase ***
  const BUCKET_NAME = 'order-attachments';

  // ✅ NEW: Define the status order manually to ensure correctness
  const statusOptions = [
    OrderStatus.NEW_ORDER,
    OrderStatus.AWAITING_APPROVAL,
    OrderStatus.REVISION_REQUESTED,
    OrderStatus.APPROVED,
    OrderStatus.IN_PRODUCTION,
    OrderStatus.QUALITY_ASSURANCE,
    OrderStatus.REMAKE,
    OrderStatus.COMPLETED,
    OrderStatus.SHIPPED,
    OrderStatus.DELIVERED,
    OrderStatus.FEEDBACK,
    OrderStatus.CANCELLED,
    OrderStatus.REFUNDED,
  ];

  return (
    <>
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      <FormSectionWrapper title="Customer Information">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-8">
          
          {/* --- LIVE CUSTOMER INSIGHTS --- */}
          {/* Pending Quote warning — pops up when this email/phone already has a quote.
              The goal: nudge agent to use Convert to Order on the quote rather than
              creating a fresh order (which loses attribution + clutters data). */}
          {pendingQuote && (
            <div className="md:col-span-2 mb-6 p-4 bg-amber-500/10 border border-amber-500/40 rounded-xl animate-in fade-in slide-in-from-top-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-amber-500/20 rounded-lg text-amber-400 flex-shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-amber-200 flex items-center gap-2 flex-wrap">
                      Quote already exists for this customer
                      <span className="text-xs font-normal bg-amber-500/30 text-amber-200 px-2 py-0.5 rounded-full font-mono">
                        {pendingQuote.quote_number}
                      </span>
                    </h4>
                    <p className="text-xs text-amber-200/80 mt-0.5">
                      {pendingQuote.customer_name || 'Unknown'}
                      {pendingQuote.estimated_amount != null && (
                        <> · Quote total: <span className="font-semibold">${Number(pendingQuote.estimated_amount).toFixed(2)}</span></>
                      )}
                    </p>
                    <p className="text-[11px] text-amber-200/70 mt-1.5 leading-relaxed">
                      Creating a new order here will <strong>lose Meta attribution</strong> and
                      leave a stale quote in the system. Use <strong>Convert to Order</strong>
                      on the quote instead.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-11 sm:ml-0 shrink-0">
                  <a
                    href={`/quote/${pendingQuote.quote_number}`}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-brand-orange hover:bg-orange-600 border border-orange-500/30 rounded-lg text-xs font-bold text-white transition-all"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Open Quote
                  </a>
                  <button
                    type="button"
                    onClick={() => setPendingQuote(null)}
                    className="flex items-center gap-1.5 px-3 py-2.5 bg-slate-900/50 hover:bg-slate-800 border border-white/10 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 transition-all"
                    title="I know — proceed anyway"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

          {existingCustomer && (
            <div className="md:col-span-2 mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl animate-in fade-in slide-in-from-top-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400 flex-shrink-0">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                      Repeat Customer
                      <span className="text-xs font-normal bg-blue-600 text-white px-2 py-0.5 rounded-full">
                        {existingCustomer.count} Past Orders
                      </span>
                    </h4>
                    <p className="text-xs text-slate-400">
                      Last order: <span className="text-slate-200">{existingCustomer.lastOrder}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-11 sm:ml-0">
                  <button
                    type="button"
                    onClick={handleCopyCustomerInfo}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-brand-orange hover:bg-orange-600 border border-orange-500/30 rounded-lg text-xs font-bold text-white transition-all"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy Info
                  </button>
                  <a
                    href={`/customers/${encodeURIComponent(watchEmail || watchPhone || '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-900/50 hover:bg-blue-600 border border-blue-500/30 rounded-lg text-xs font-bold text-blue-400 hover:text-white transition-all"
                  >
                    <History className="w-3.5 h-3.5" />
                    History
                  </a>
                </div>
              </div>
            </div>
          )}

          {accountMatch && (
            <div className="md:col-span-2 mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl animate-in fade-in slide-in-from-top-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400 flex-shrink-0">
                    <BadgeCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                      Customer Account Found
                    </h4>
                    <p className="text-xs text-slate-400">
                      {accountMatch.fullName || accountMatch.email}
                      {accountMatch.companyName ? ` · ${accountMatch.companyName}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-11 sm:ml-0">
                  <button
                    type="button"
                    onClick={handleUseAccountInfo}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 border border-emerald-500/30 rounded-lg text-xs font-bold text-white transition-all"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Use Account Info
                  </button>
                  <a
                    href={`/portal-customers/${accountMatch.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-900/50 hover:bg-emerald-600 border border-emerald-500/30 rounded-lg text-xs font-bold text-emerald-400 hover:text-white transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    View Account
                  </a>
                </div>
              </div>
            </div>
          )}

          {isNewOrder && (
            <div className="md:col-span-2 flex items-center gap-2 -mt-2 mb-2">
              <input
                type="checkbox"
                id="premium-customer-checkbox"
                checked={isPremiumCustomer}
                onChange={(e) => setIsPremiumCustomer(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-400 focus:ring-amber-400/50"
              />
              <label htmlFor="premium-customer-checkbox" className="text-sm text-slate-300 flex items-center gap-1.5 cursor-pointer">
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                Mark as Premium Customer
                <span className="text-xs text-slate-500">(production will apply extra QA/QC)</span>
              </label>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-300">Customer Name</label>
            <input type="text" {...register('customerName', { required: 'Required' })} className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange" />
            {errors.customerName && <p className="text-red-400 text-xs mt-1">{errors.customerName.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">Email</label>
            <input type="email" {...register('customerEmail', { required: 'Required' })} className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">
              CC Email <span className="text-slate-400 font-normal">(optional — 2nd contact)</span>
            </label>
            <input
              type="email"
              {...register('ccEmail', {
                validate: (val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) || 'Invalid email address'
              })}
              placeholder="e.g. manager@company.com"
              className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange placeholder:text-slate-400"
            />
            {errors.ccEmail && <p className="text-red-400 text-xs mt-1">{errors.ccEmail.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">Phone</label>
            <input type="tel" {...register('customerPhone')} className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">Profile URL</label>
            <input type="url" {...register('customerProfileUrl')} className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">Purchase Order</label>
            <input type="text" {...register('purchaseOrder')} placeholder="Customer PO # (searchable)" className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white placeholder-slate-500 focus:ring-brand-orange focus:border-brand-orange" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">Organization <span className="text-slate-500 font-normal">(optional)</span></label>
            <input type="text" {...register('organization')} placeholder="Company / dept / team (if ordering for an org)" className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white placeholder-slate-500 focus:ring-brand-orange focus:border-brand-orange" />
          </div>
        </div>
      </FormSectionWrapper>

      <FormSectionWrapper title="Design & Product">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-5 md:gap-8">
          {/* Row 1: Design Name | Border Type | Quantity */}
          <div>
            <label className="block text-sm font-medium text-slate-300">Design Name</label>
            <input type="text" {...register('designName')} className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">Border Type</label>
            <select {...register('borderType')} className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange">
              <option value="" disabled hidden>Select...</option>
              <option value="Merrow Border">Merrow Border</option>
              <option value="Embroidery Border">Embroidery Border</option>
              <option value="Laser Cut">Laser Cut</option>
              <option value="No Border">No Border</option>
            </select>
          </div>
          {!isDSTService ? (
            <div>
              <label className="block text-sm font-medium text-slate-300">Quantity</label>
              <input type="number" {...register('patchesQuantity', { required: true, min: 1, valueAsNumber: true })} className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange" />
            </div>
          ) : <div />}

          {/* Row 2: Patch Type | Size | Backing */}
          <div>
            <label className="block text-sm font-medium text-slate-300">Patch Type</label>
            <select {...register('patchesType')} className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange">
              <option value="" disabled hidden>Select...</option>
              {patchTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">Size</label>
            <input type="text" {...register('designSize')} className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">Backing</label>
            <select {...register('designBacking')} className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange">
              <option value="" disabled hidden>Select...</option>
              {backingOptions.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-10">
          <label className="block text-sm font-medium text-slate-300">Special Instructions</label>
          <Textarea
            {...register('instructions')}
            error={errors.instructions?.message}
            maxLength={500} // Optional limit
            className="w-full mt-1"
          />
        </div>
        <div className="mt-8">
          <label className="flex items-center gap-2 cursor-pointer w-fit">
            <input type="checkbox" {...register('sampleBox')} className="h-5 w-5 rounded bg-slate-700 border-slate-600 text-brand-orange focus:ring-brand-orange" />
            <span className="text-sm font-semibold text-slate-200">📦 Include a Sample Box with this order</span>
          </label>
          <p className="text-xs text-slate-400 mt-1 ml-7">Tick when the customer wants a sample box alongside their patches.</p>
        </div>
      </FormSectionWrapper>

      <FormSectionWrapper title="Shipping Details">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-8">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-300">Shipping Address</label>
            <Textarea
              {...register('shippingAddress')}
              error={errors.shippingAddress?.message}
              className="w-full mt-1"
            />
          </div>
          {/* Structured City / State / ZIP — clean geo data for metro analytics.
              The address above stays the full display address; fill these too so reports don't
              have to parse the free-text blob. Website orders auto-populate these from checkout. */}
          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300">City</label>
              <input
                type="text"
                {...register('shipCity')}
                placeholder="e.g. Houston"
                className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300">State / Region</label>
              <input
                type="text"
                {...register('shipState')}
                placeholder="e.g. TX"
                className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300">ZIP / Postcode</label>
              <input
                type="text"
                {...register('shipPostal')}
                placeholder="e.g. 77001"
                className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">Carrier</label>
            <select {...register('shippingCarrier')} className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange">
              <option value="" disabled hidden>Select...</option>
              {shippingCarriers.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">Tracking #</label>
            <input type="text" {...register('shippingTrackingNumber')} className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange" />
          </div>
        </div>
      </FormSectionWrapper>

      {/* ATTACHMENTS SECTION */}
      <FormSectionWrapper title="Attachments & Files">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-8">
          
          {/* Mockups */}
          <div className="md:col-span-2">
            <FileUploadSection
              title="Mockups / Proofs"
              bucketName={BUCKET_NAME}
              folderPath={`mockups/${orderNum}`}
              urls={watch('mockupUrls') || []}
              onUrlsChange={(urls) => setValue('mockupUrls', urls)}
              onUploadStateChange={setIsUploading}
            />
          </div>

          {/* Production Files */}
          <div className="md:col-span-2">
            <FileUploadSection
              title="Production Files (DST, EMB, PDF)"
              bucketName={BUCKET_NAME}
              folderPath={`production-files/${orderNum}`}
              urls={watch('productionFileUrls') || []}
              onUrlsChange={(urls) => setValue('productionFileUrls', urls)}
              onUploadStateChange={setIsUploading}
            />
          </div>

          {/* Customer References */}
          <div>
            <FileUploadSection
              title="Customer References"
              bucketName={BUCKET_NAME}
              folderPath={`customer-refs/${orderNum}`}
              urls={watch('customerAttachmentUrls') || []}
              onUrlsChange={(urls) => setValue('customerAttachmentUrls', urls)}
              onUploadStateChange={setIsUploading}
            />
          </div>
          
          {/* Shipping Labels */}
          <div>
            <FileUploadSection
              title="Shipping Attachments / Labels"
              bucketName={BUCKET_NAME}
              folderPath={`shipping-docs/${orderNum}`}
              urls={watch('shippingAttachmentUrls') || []}
              onUrlsChange={(urls) => setValue('shippingAttachmentUrls', urls)}
              onUploadStateChange={setIsUploading}
            />
          </div>

        </div>
      </FormSectionWrapper>

      {(showFinancialsProp || canEditFinancials) && (
        <FormSectionWrapper title="Financials">
          {/* Loyalty (CL86F1) — informational; records the applied code, never changes Order Amount */}
          <input type="hidden" {...register('loyaltyCodeUsed')} />
          <input type="hidden" {...register('loyaltyDiscountPercent')} />
          <LoyaltyOrderPanel
            customerEmail={watch('customerEmail')}
            orderAmount={watch('orderAmount', 0) || 0}
            appliedCode={watch('loyaltyCodeUsed')}
            onApply={(code, percent) => {
              setValue('loyaltyCodeUsed', code, { shouldDirty: true });
              setValue('loyaltyDiscountPercent', percent, { shouldDirty: true });
            }}
          />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5 md:gap-8">
            <div>
              <label className="block text-xs text-slate-400">Order Amount</label>
              <input type="number" step="0.01" {...register('orderAmount', { required: 'Required', valueAsNumber: true, min: { value: 0, message: "Cannot be negative" } })} className="w-full bg-slate-800 border-slate-600 rounded-md text-white" disabled={!canEditFinancials} />
              {errors.orderAmount && <p className="text-red-400 text-xs mt-1">{errors.orderAmount.message}</p>}
            </div>
            <div>
              <label className="block text-xs text-slate-400">Amount Paid</label>
              {canEditFinancials && !isNewOrder && initialData?.id ? (
                <>
                  {/* Editable for admins / financial editors. On save, a CHANGE here is routed through the
                      guarded correct_order_payment RPC (see EditOrderPage) — never a raw write — so a payment
                      landing while the form is open still can't clobber it (PP-11151), and a confirmed Square
                      payment can't be silently wiped. "Record payment" logs a payment WITH method/reference. */}
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    {...register('amountPaid', { valueAsNumber: true, min: { value: 0, message: 'Cannot be negative' } })}
                    className="w-full bg-slate-800 border-slate-600 rounded-md text-white"
                  />
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[10px] text-slate-500">
                      {amountRemaining > 0.01 ? `Remaining $${amountRemaining.toFixed(2)}` : 'Fully paid.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowRecordPayment(true)}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1"
                    >
                      <DollarSign size={12} /> Record payment
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <input type="hidden" {...register('amountPaid', { valueAsNumber: true })} />
                  <div className="w-full bg-slate-800/60 border border-slate-700 rounded-md px-3 py-2 text-white flex items-center justify-between min-h-[38px]">
                    <span>${amountPaid.toFixed(2)}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {isNewOrder ? 'Set by payments after the order is created.' : 'Financials restricted.'}
                  </p>
                </>
              )}
            </div>
            <div>
              <label className="block text-xs text-slate-400">Production Cost</label>
              <input type="number" step="0.01" {...register('productionCost', { valueAsNumber: true, min: { value: 0, message: "Cannot be negative" } })} className="w-full bg-slate-800 border-slate-600 rounded-md text-white" disabled={!canEditFinancials} />
              {errors.productionCost && <p className="text-red-400 text-xs mt-1">{errors.productionCost.message}</p>}
            </div>
            <div>
              <label className="block text-xs text-slate-400">Shipping Cost</label>
              <input type="number" step="0.01" {...register('shippingCost', { valueAsNumber: true, min: { value: 0, message: "Cannot be negative" } })} className="w-full bg-slate-800 border-slate-600 rounded-md text-white" disabled={!canEditFinancials} />
              {errors.shippingCost && <p className="text-red-400 text-xs mt-1">{errors.shippingCost.message}</p>}
            </div>
            <div className="col-span-2 md:col-span-4">
              <label className="block text-xs text-slate-400">Marketing Cost</label>
              <input type="number" step="0.01" {...register('marketingCost', { valueAsNumber: true, min: { value: 0, message: "Cannot be negative" } })} className="w-full bg-slate-800 border-slate-600 rounded-md text-white" disabled={!canEditFinancials} />
              {errors.marketingCost && <p className="text-red-400 text-xs mt-1">{errors.marketingCost.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-5 md:gap-8 pt-6 mt-6 border-t border-slate-700">
            <div><p className="text-xs text-slate-400">Remaining</p><p className="text-xl font-bold text-amber-400">${amountRemaining.toFixed(2)}</p></div>
            <div><p className="text-xs text-slate-400">Profit</p><p className={`text-xl font-bold ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>${profit.toFixed(2)}</p></div>
          </div>
        </FormSectionWrapper>
      )}

      <FormSectionWrapper title="Order Status">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-8">
          <div>
            <label className="block text-sm font-medium text-slate-300">
              Status <span className="text-red-400">*</span>
            </label>
            <select 
              {...register('status', { 
                required: 'Status is required'  // ✅ LAYER 2: Enforce required
              })} 
              className={`mt-1 block w-full bg-slate-800 border rounded-md text-white focus:ring-brand-orange focus:border-brand-orange transition-colors ${
                errors.status 
                  ? 'border-red-500 bg-red-950/10' 
                  : 'border-slate-600'
              }`}
            >
              <option value="" disabled hidden>-- Select Status --</option>
              {/* ✅ FIX: Use the manually defined list to guarantee order and inclusion */}
              {statusOptions.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
            {errors.status && (
              <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                <span>⚠️</span>
                {errors.status.message}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">Lead Source</label>
            <select {...register('leadSource')} className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange">
              <option value="" disabled hidden>Select...</option>
              {LEAD_SOURCE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">
              Country
            </label>
            <select
              {...register('country')}
              className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange"
            >
              <option value="" disabled hidden>Select country...</option>
              {COUNTRY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {errors.country && (
              <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                <span>⚠️</span>
                {errors.country.message as string}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 pb-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" {...register('isUrgent')} className="h-5 w-5 rounded bg-slate-700 border-slate-600 text-brand-orange focus:ring-brand-orange" />
              <span className="text-sm font-bold text-slate-200">Mark as Urgent</span>
            </label>
            {watch('isUrgent') && (
              <div className="mt-1 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <label className="block text-xs font-semibold text-red-400 mb-1.5 uppercase tracking-wide">
                  🚨 Required Ship-By Date
                </label>
                <input
                  type="date"
                  {...register('rushDate', { required: watch('isUrgent') ? 'Ship-by date is required for urgent orders' : false })}
                  min={new Date().toISOString().split('T')[0]}
                  className="block w-full bg-slate-800 border-red-500/50 rounded-md text-white focus:ring-red-500 focus:border-red-500 text-sm px-3 py-2"
                />
                {errors.rushDate && <p className="text-red-400 text-xs mt-1">{errors.rushDate.message}</p>}
              </div>
            )}
          </div>

          {/* Ship-By reminder — soft target date. Tick to reveal the box. Does NOT mark the order urgent. */}
          <div className="flex flex-col gap-2 pb-3">
            <label className="flex items-center gap-2 cursor-pointer w-fit">
              <input
                type="checkbox"
                checked={showShipBy}
                onChange={(e) => {
                  setShowShipBy(e.target.checked);
                  if (!e.target.checked) setValue('shipByDate', null, { shouldDirty: true });
                }}
                className="h-5 w-5 rounded bg-slate-700 border-slate-600 text-brand-orange focus:ring-brand-orange"
              />
              <span className="text-sm font-bold text-slate-200">📦 Set a Ship-By reminder</span>
            </label>
            {showShipBy && (
              <div className="mt-1 p-3 bg-slate-700/30 border border-slate-600 rounded-lg">
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">
                  Ship-By date
                </label>
                <input
                  type="date"
                  {...register('shipByDate')}
                  className="block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange text-sm px-3 py-2"
                />
                <p className="text-[11px] text-slate-400 mt-1">Soft target — shows a reminder pill on the order. Does not mark it urgent.</p>
              </div>
            )}
          </div>
        </div>
        
        {/* ✅ CONDITIONAL REASON BLOCK — Cancelled / Refunded / Remake */}
        {(watchedStatus === 'CANCELLED' || watchedStatus === 'REFUNDED' || watchedStatus === 'REMAKE') && (
          <div className={`mt-10 p-8 rounded-lg animate-fadeIn ${
            watchedStatus === 'REMAKE'
              ? 'bg-amber-500/10 border border-amber-500/30'
              : 'bg-red-500/10 border border-red-500/30'
          }`}>
            <h4 className={`${watchedStatus === 'REMAKE' ? 'text-amber-200' : 'text-red-200'} font-semibold mb-4 flex items-center gap-2`}>
              {watchedStatus === 'REMAKE' ? '🔄 Remake' : watchedStatus === 'CANCELLED' ? '⚠️ Cancellation' : '⚠️ Refund'} Details
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-8">
              {/* Reason Category Dropdown */}
              <div>
                <label className="block text-sm font-medium text-slate-300">
                  Reason Category <span className="text-red-400">*</span>
                </label>
                <select
                  {...register('reasonCategory', { required: 'Reason is required' })}
                  className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange"
                >
                  <option value="" disabled hidden>Select a reason...</option>
                  {watchedStatus === 'CANCELLED'
                    ? CANCELLATION_REASONS.map(r => <option key={r} value={r}>{r}</option>)
                    : watchedStatus === 'REMAKE'
                    ? REMAKE_REASONS.map(r => <option key={r} value={r}>{r}</option>)
                    : REFUND_REASONS.map(r => <option key={r} value={r}>{r}</option>)
                  }
                </select>
                {errors.reasonCategory && <p className="text-red-400 text-xs mt-1">{errors.reasonCategory.message}</p>}
              </div>

              {/* Reason Details Text Area */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-300">
                  Additional Notes / Explanation
                </label>
                <textarea
                  rows={3}
                  {...register('reasonDetails')}
                  className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange placeholder-slate-400"
                  placeholder={watchedStatus === 'REMAKE'
                    ? "Describe the issue (e.g., 'Package lost in transit, customer never received')..."
                    : "Provide specific details (e.g., 'Customer denies receiving')..."}
                />
              </div>
            </div>
          </div>
        )}

      </FormSectionWrapper>

      <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 sm:gap-4 pt-6 border-t border-slate-700">
        <Button type="button" variant="secondary" onClick={() => reset(formDefaultValues)} disabled={isSaving || isUploading} className="w-full sm:w-auto">
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving || isUploading} title={isUploading ? "Please wait for all files to finish uploading" : ""} className="w-full sm:w-auto">
          {isSaving ? <Spinner small /> : isUploading ? 'Uploading Files...' : 'Save Changes'}
        </Button>
      </div>
    </form>

    {/* Record a payment made outside the Square link (bank / cash / Square invoice / other) via the
        same atomic, audited RPC used on the order page — rendered OUTSIDE the <form> so its buttons
        (which default to type=submit) don't submit the order form. */}
    {!isNewOrder && initialData?.id && (
      <MarkAsPaidModal
        isOpen={showRecordPayment}
        onClose={() => setShowRecordPayment(false)}
        orderId={initialData.id}
        orderNumber={initialData.orderNumber}
        orderAmount={orderAmount}
        amountAlreadyPaid={amountPaid}
      />
    )}
    </>
  );
};

export default OrderForm;