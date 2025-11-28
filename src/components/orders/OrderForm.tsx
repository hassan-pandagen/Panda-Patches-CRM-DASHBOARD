// src/components/orders/OrderForm.tsx

import React, { useEffect, useMemo, FC } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { useAuth } from '../../contexts/AuthContext';
import { Order, OrderStatus, UserRole } from '../../types';
import Button from '../ui/Button';
import Spinner from '../ui/Spinner';
import FileUploadSection from './FileUpload'; 
import Textarea from '../ui/Textarea'; 
import { LEAD_SOURCE_OPTIONS } from '../../constants';

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
}

interface OrderFormProps {
  onSave: (formData: SaveData) => void;
  initialData?: Order | null;
  isSaving?: boolean;
  onFormChange?: () => void;
  showFinancials?: boolean;
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
  };
};

const OrderForm: React.FC<OrderFormProps> = ({ 
  onSave, 
  initialData, 
  isSaving = false, 
  onFormChange,
  showFinancials: showFinancialsProp // Use prop if provided
}) => {
  const { role, permissions } = useAuth();

  const formDefaultValues = useMemo(() => transformOrderToFormData(initialData), [initialData]);

  const { register, handleSubmit, watch, formState: { errors, isDirty }, reset, setValue } = useForm<SaveData>({
    defaultValues: formDefaultValues,
  });

  useEffect(() => {
    if (isDirty && onFormChange) onFormChange();
  }, [isDirty, onFormChange]);

  useEffect(() => {
    reset(transformOrderToFormData(initialData));
  }, [initialData, reset]);

  const onSubmit = (data: SaveData) => {
    onSave(data);
  };

  // ✅ CRITICAL FIX: Determine visibility. Prioritize prop from parent (like on the Edit page), 
  // then fallback to a proper role/permission check (which fixes the New Order page).
  const canViewFinancials = showFinancialsProp !== undefined 
    ? showFinancialsProp 
    : (role === UserRole.ADMIN || permissions?.view_financials === true);

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
  
  // Helper for file updates
  const moveFile = (url: string, from: keyof SaveData, to: keyof SaveData) => {
    // Remove from the 'from' list
    setValue(from, ((watch(from) as string[]) || []).filter(u => u !== url), { shouldDirty: true });
    // Add to the 'to' list
    setValue(to, [...((watch(to) as string[]) || []), url], { shouldDirty: true });
  };

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
          {/* REPLACED STANDARD <textarea> WITH YOUR CUSTOM <Textarea> */}
          <Textarea 
            label="Special Instructions"
            {...register('instructions')}
            error={errors.instructions?.message}
            maxLength={500} // Optional limit
            className="w-full"
          />
        </div>
      </FormSectionWrapper>

      <FormSectionWrapper title="Shipping Details">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="md:col-span-2">
            {/* REPLACED STANDARD <textarea> WITH YOUR CUSTOM <Textarea> */}
            <Textarea 
              label="Shipping Address"
              {...register('shippingAddress')}
              error={errors.shippingAddress?.message}
              className="w-full"
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
              bucketName={BUCKET_NAME} // <--- FIX: Uses correct bucket
              folderPath={`mockups/${orderNum}`}
              urls={watch('mockupUrls') || []}
              onUrlsChange={(newUrls) => setValue('mockupUrls', newUrls, { shouldDirty: true })}
              onMoveFile={(url) => moveFile(url, 'mockupUrls', 'productionFileUrls')}
              moveLabel="Move to Production Files"
            />
          </div>

          {/* Production Files */}
          <div className="md:col-span-2">
            <FileUploadSection
              title="Production Files (DST, EMB, PDF)"
              bucketName={BUCKET_NAME} // <--- FIX
              folderPath={`production-files/${orderNum}`}
              urls={watch('productionFileUrls') || []}
              onUrlsChange={(newUrls) => setValue('productionFileUrls', newUrls, { shouldDirty: true })}
            />
          </div>

          {/* Customer References */}
          <div>
            <FileUploadSection
              title="Customer References"
              bucketName={BUCKET_NAME} // <--- FIX
              folderPath={`customer-refs/${orderNum}`}
              urls={watch('customerAttachmentUrls') || []}
              onUrlsChange={(newUrls) => setValue('customerAttachmentUrls', newUrls, { shouldDirty: true })}
            />
          </div>
          
          {/* Shipping Labels */}
          <div>
            <FileUploadSection
              title="Shipping Attachments / Labels"
              bucketName={BUCKET_NAME} // <--- FIX
              folderPath={`shipping-docs/${orderNum}`}
              urls={watch('shippingAttachmentUrls') || []}
              onUrlsChange={(newUrls) => setValue('shippingAttachmentUrls', newUrls, { shouldDirty: true })}
            />
          </div>

        </div>
      </FormSectionWrapper>

      {canViewFinancials && ( // This now uses the corrected logic
        <FormSectionWrapper title="Financials">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
            <div><label className="block text-xs text-slate-400">Order Amount</label><input type="number" step="0.01" {...register('orderAmount', { valueAsNumber: true })} className="w-full bg-slate-800 border-slate-600 rounded-md text-white" /></div>
            <div><label className="block text-xs text-slate-400">Amount Paid</label><input type="number" step="0.01" {...register('amountPaid', { valueAsNumber: true })} className="w-full bg-slate-800 border-slate-600 rounded-md text-white" /></div>
            <div><label className="block text-xs text-slate-400">Production Cost</label><input type="number" step="0.01" {...register('productionCost', { valueAsNumber: true })} className="w-full bg-slate-800 border-slate-600 rounded-md text-white" /></div>
            <div><label className="block text-xs text-slate-400">Shipping Cost</label><input type="number" step="0.01" {...register('shippingCost', { valueAsNumber: true })} className="w-full bg-slate-800 border-slate-600 rounded-md text-white" /></div>
            <div className="col-span-2 md:col-span-4"><label className="block text-xs text-slate-400">Marketing Cost</label><input type="number" step="0.01" {...register('marketingCost', { valueAsNumber: true })} className="w-full bg-slate-800 border-slate-600 rounded-md text-white" /></div>
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
        <Button type="button" variant="secondary" onClick={() => reset(formDefaultValues)}>Cancel</Button>
        <Button type="submit" disabled={isSaving}>{isSaving ? <Spinner small /> : 'Save Changes'}</Button>
      </div>
    </form>
  );
};

export default OrderForm;