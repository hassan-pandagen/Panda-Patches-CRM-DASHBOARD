// src/components/orders/OrderForm.tsx

import React, { useEffect, useMemo, FC, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAuth } from '../../contexts/AuthContext';
import { Order, OrderStatus, UserRole } from '../../types';
import Button from '../ui/Button';
import { useToast } from '../../hooks/useToast';
import Spinner from '../ui/Spinner';
import FileUploadSection from './FileUpload'; 
import Textarea from '../ui/Textarea'; 
import { LEAD_SOURCE_OPTIONS } from '../../constants';
import { supabase } from '../../services/supabaseClient';
import { logger } from '../../services/logger';
import { History, UserCheck, ExternalLink } from 'lucide-react';

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

const FormSectionWrapper: FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
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
  customerPhone?: string;
  customerProfileUrl?: string;
  shippingAddress?: string;
  designName?: string;
  patchesQuantity: number;
  patchesType?: string;
  designSize?: string;
  designBacking?: string;
  instructions?: string;
  orderAmount: number;
  amountPaid: number;
  productionCost: number;
  shippingCost: number;
  marketingCost: number;
  leadSource?: string;
  status: string;
  isUrgent: boolean;
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
  internalNote?: string;
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
}


// TRANSFORM: Convert DB data to Form Data
const transformOrderToFormData = (order: Order | null | undefined): SaveData => {
  if (!order) return {} as SaveData;
  return {
    ...order,
    patchesQuantity: order.patchesQuantity || 0,
    mockupUrls: Array.isArray(order.mockupUrls) ? order.mockupUrls : [],
    productionFileUrls: Array.isArray(order.productionFileUrls) ? order.productionFileUrls : [],
    shippingAttachmentUrls: Array.isArray(order.shippingAttachmentUrls) ? order.shippingAttachmentUrls : [],
    customerAttachmentUrls: Array.isArray(order.customerAttachmentUrls) ? order.customerAttachmentUrls : [],
    
    // ✅ Initialize new fields
    reasonCategory: order.reasonCategory || '',
    reasonDetails: order.reasonDetails || '',
    internalNote: order.internalNote || '',
  };
};

const OrderForm: React.FC<OrderFormProps> = ({ 
  onSave, 
  initialData, 
  showFinancials: showFinancialsProp,
  isNewOrder = false,
  onFormChange
}) => {
  const { role, permissions } = useAuth();
  
  // ✅ FIX: Get toast methods directly
  const { success, error: showError } = useToast();

  const formDefaultValues = useMemo(() => transformOrderToFormData(initialData), [initialData]);

  // Internal state for the spinner, managed by the form itself.
  const [isSaving, setIsSaving] = useState(false);
  
  // ✅ State for live customer check
  const [existingCustomer, setExistingCustomer] = useState<ExistingCustomerInfo | null>(null);
  const [isCheckingCustomer, setIsCheckingCustomer] = useState(false);

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
        const { data, error, count } = await supabase
          .from('orders')
          .select('created_at', { count: 'exact', head: false })
          .or(`customer_email.eq.${identifier},customer_phone.eq.${identifier}`)
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) throw error;

        if (count && count > 0) {
          setExistingCustomer({
            count: count,
            lastOrder: new Date(data[0].created_at).toLocaleDateString(),
          });
        } else {
          setExistingCustomer(null);
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
  }, [watchEmail, watchPhone, isNewOrder]);

  const onSubmit = async (data: SaveData) => {
    console.log('📝 Form submitted with data:', data);
    setIsSaving(true); // Start Spinner

    try {
      // This will now always succeed because of Step 1,
      // unless the Database itself is down.
      const changes: ChangeDetail[] = [];
      if (!isNewOrder && initialData) {
        // Compare current form data with the initial data to find what changed.
        for (const key in data) {
          const typedKey = key as keyof SaveData;
          // Using JSON.stringify to reliably compare values, including arrays.
          if (JSON.stringify(formDefaultValues[typedKey]) !== JSON.stringify(data[typedKey])) {
            changes.push({
              field: typedKey,
              oldValue: formDefaultValues[typedKey],
              newValue: data[typedKey],
            });
          }
        }
      }

      await onSave({
        current: data,
        isNew: isNewOrder,
        changes,
      });
      // ✅ FIX: Use the destructured success method
      success('Order saved successfully!');
      reset(data); // <-- CRITICAL FIX: Reset form state to prevent "unsaved changes" warning.
    } catch (error: any) {
      logger.error("💥 Save Error:", error);
      // ✅ FIX: Use the destructured showError method
      showError(error.message || 'Failed to save order. Please try again.');
    } finally {
      setIsSaving(false);
    }
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

  const patchTypes = ["Embroidered", "PVC", "Woven", "Chenille", "Leather", "Printed", "3D Embroidery Transfer", "Chenille Transfer", "Sequin Patch"];
  const shippingCarriers = ["FedEx", "DHL", "UPS", "USPS", "Other"];
  const backingOptions = ["Iron on", "Sew on", "Sticker", "Velcro"];
  
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
    OrderStatus.QUALITY_ASSURANCE, // <-- The missing status
    OrderStatus.SHIPPED,
    OrderStatus.DELIVERED,
    OrderStatus.FEEDBACK,
    OrderStatus.CANCELLED,
    OrderStatus.REFUNDED,
  ];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      <FormSectionWrapper title="Customer Information">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          
          {/* --- LIVE CUSTOMER INSIGHTS --- */}
          {existingCustomer && (
            <div className="md:col-span-2 mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-center justify-between animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    Repeat Customer Detected
                    <span className="text-xs font-normal bg-blue-600 text-white px-2 py-0.5 rounded-full">
                      {existingCustomer.count} Past Orders
                    </span>
                  </h4>
                  <p className="text-xs text-slate-400">
                    Last order placed on: <span className="text-slate-200">{existingCustomer.lastOrder}</span>
                  </p>
                </div>
              </div>
              
              <div className="text-right">
                {/* ✅ THE FIX: Opens History in a NEW TAB so form data isn't lost */}
                <a 
                  href={`/customers/${encodeURIComponent(watchEmail || watchPhone)}`}
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/50 hover:bg-blue-600 border border-blue-500/30 rounded-lg text-xs font-bold text-blue-400 hover:text-white transition-all group"
                >
                  <History className="w-3 h-3 group-hover:animate-spin-slow" />
                  View History
                  <ExternalLink className="w-3 h-3 opacity-50" />
                </a>
              </div>
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
            <label className="block text-sm font-medium text-slate-300">Phone</label>
            <input type="tel" {...register('customerPhone')} className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">Profile URL</label>
            <input type="url" {...register('customerProfileUrl')} className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange" />
          </div>
        </div>
      </FormSectionWrapper>

      <FormSectionWrapper title="Design & Product">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-300">Design Name</label>
            <input type="text" {...register('designName')} className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">Quantity</label>
            <input type="number" {...register('patchesQuantity', { required: true, min: 1, valueAsNumber: true })} className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">Patch Type</label>
            <select {...register('patchesType')} className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange">
              <option value="">Select...</option>
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
              <option value="">Select...</option>
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
      </FormSectionWrapper>

      <FormSectionWrapper title="Shipping Details">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-300">Shipping Address</label>
            <Textarea
              {...register('shippingAddress')}
              error={errors.shippingAddress?.message}
              className="w-full mt-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">Carrier</label>
            <select {...register('shippingCarrier')} className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange">
              <option value="">Select...</option>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          
          {/* Mockups */}
          <div className="md:col-span-2">
            <FileUploadSection
              title="Mockups / Proofs"
              bucketName={BUCKET_NAME}
              folderPath={`mockups/${orderNum}`}
              urls={watch('mockupUrls') || []}
              onUrlsChange={(urls) => setValue('mockupUrls', urls)}
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
            />
          </div>

        </div>
      </FormSectionWrapper>

      {(showFinancialsProp || canEditFinancials) && (
        <FormSectionWrapper title="Financials">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
            <div>
              <label className="block text-xs text-slate-400">Order Amount</label>
              <input type="number" step="0.01" {...register('orderAmount', { required: 'Required', valueAsNumber: true, min: { value: 0, message: "Cannot be negative" } })} className="w-full bg-slate-800 border-slate-600 rounded-md text-white" disabled={!canEditFinancials} />
              {errors.orderAmount && <p className="text-red-400 text-xs mt-1">{errors.orderAmount.message}</p>}
            </div>
            <div>
              <label className="block text-xs text-slate-400">Amount Paid</label>
              <input type="number" step="0.01" {...register('amountPaid', { required: 'Required', valueAsNumber: true, min: { value: 0, message: "Cannot be negative" } })} className="w-full bg-slate-800 border-slate-600 rounded-md text-white" disabled={!canEditFinancials} />
              {errors.amountPaid && <p className="text-red-400 text-xs mt-1">{errors.amountPaid.message}</p>}
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
          <div className="grid grid-cols-2 gap-10 pt-6 mt-6 border-t border-slate-700">
            <div><p className="text-xs text-slate-500">Remaining</p><p className="text-xl font-bold text-amber-400">${amountRemaining.toFixed(2)}</p></div>
            <div><p className="text-xs text-slate-500">Profit</p><p className={`text-xl font-bold ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>${profit.toFixed(2)}</p></div>
          </div>
        </FormSectionWrapper>
      )}

      <FormSectionWrapper title="Order Status">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          <div>
            <label className="block text-sm font-medium text-slate-300">Status</label>
            <select {...register('status')} className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange">
              {/* ✅ FIX: Use the manually defined list to guarantee order and inclusion */}
              {statusOptions.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">Lead Source</label>
            <select {...register('leadSource')} className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange">
              <option value="">Select...</option>
              {LEAD_SOURCE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-end pb-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" {...register('isUrgent')} className="h-5 w-5 rounded bg-slate-700 border-slate-600 text-brand-orange focus:ring-brand-orange" />
              <span className="text-sm font-bold text-slate-200">Mark as Urgent</span>
            </label>
          </div>
        </div>
        
        {/* ✅ NEW: Internal Note for Admins */}
        <div className="mt-10">
          <label className="block text-sm font-medium text-slate-300">
            Internal Note (Visible to Admins Only)
          </label>
          <Textarea
            {...register('internalNote')}
            rows={3}
            className="w-full mt-1"
            placeholder="e.g., 'Approved by Jane Doe on 10/26/2023 - customer confirmed via phone.'"
          />
        </div>

        {/* ✅ NEW: CONDITIONAL REASON BLOCK */}
        {(watchedStatus === 'CANCELLED' || watchedStatus === 'REFUNDED') && (
          <div className="mt-10 p-8 rounded-lg animate-fadeIn bg-red-500/10 border border-red-500/30">
            <h4 className="text-red-200 font-semibold mb-4 flex items-center gap-2">
              ⚠️ {watchedStatus === 'CANCELLED' ? 'Cancellation' : 'Refund'} Details
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              {/* Reason Category Dropdown */}
              <div>
                <label className="block text-sm font-medium text-slate-300">
                  Reason Category <span className="text-red-400">*</span>
                </label>
                <select
                  {...register('reasonCategory', { required: 'Reason is required' })}
                  className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange"
                >
                  <option value="" disabled>Select a reason...</option>
                  {watchedStatus === 'CANCELLED' 
                    ? CANCELLATION_REASONS.map(r => <option key={r} value={r}>{r}</option>)
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
                  placeholder="Provide specific details (e.g., 'Customer denies receiving')..."
                />
              </div>
            </div>
          </div>
        )}

      </FormSectionWrapper>

      <div className="flex justify-end gap-4 pt-6 border-t border-slate-700">
        <Button type="button" variant="secondary" onClick={() => reset(formDefaultValues)}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving}>{isSaving ? <Spinner small /> : 'Save Changes'}</Button>
      </div>
    </form>
  );
};

export default OrderForm;