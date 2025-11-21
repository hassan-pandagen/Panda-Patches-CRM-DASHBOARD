// src/components/orders/OrderForm.tsx

import React, { useEffect, useMemo, FC } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { useAuth } from '../../contexts/AuthContext';
import { Order, OrderStatus, UserRole } from '../../types';
import Button from '../ui/Button';
import Spinner from '../ui/Spinner';
import FileUpload from './FileUpload'; 
import Textarea from '../ui/Textarea'; 
import { LEAD_SOURCE_OPTIONS } from '../../constants';

const FormSectionWrapper: FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="group relative bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl p-6">
    <h3 className="relative text-lg font-semibold text-white pb-2 mb-6">
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
  status: OrderStatus | string;
  isUrgent: boolean;
  shippingCarrier?: string;
  shippingTrackingNumber?: string;
  // Files as simple string arrays
  mockupUrls?: string[];
  productionFileUrls?: string[];
  shippingAttachmentUrls?: string[];
  customerAttachmentUrls?: string[];
}

interface OrderFormProps {
  onSave: (formData: SaveData) => void;
  initialData?: Order | null;
  isSaving?: boolean;
  onFormChange?: () => void;
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
  };
};

const OrderForm: React.FC<OrderFormProps> = ({ onSave, initialData, isSaving = false, onFormChange }) => {
  const { role } = useAuth();

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

  const canViewFinancials = role === UserRole.ADMIN || role === UserRole.AGENT;

  // Financial Calcs
  const orderAmount = watch('orderAmount', 0) || 0;
  const amountPaid = watch('amountPaid', 0) || 0;
  const productionCost = watch('productionCost', 0) || 0;
  const shippingCost = watch('shippingCost', 0) || 0;
  const marketingCost = watch('marketingCost', 0) || 0;
  const amountRemaining = orderAmount - amountPaid;
  const profit = orderAmount - (productionCost + shippingCost + marketingCost);

  const patchTypes = ["Embroidered", "PVC", "Woven", "Chenille", "Leather", "Printed"];
  const shippingCarriers = ["FedEx", "DHL", "UPS", "USPS", "Other"];
  
  // Helper for file updates
  const updateFiles = (fieldName: keyof SaveData, newUrl: string) => {
    const currentFiles = (watch(fieldName) as string[]) || [];
    setValue(fieldName, [...currentFiles, newUrl], { shouldDirty: true });
  };

  const removeFile = (fieldName: keyof SaveData, urlToRemove: string) => {
    const currentFiles = (watch(fieldName) as string[]) || [];
    setValue(fieldName, currentFiles.filter(u => u !== urlToRemove), { shouldDirty: true });
  };

  const orderNum = initialData?.orderNumber || 'new-order';
  
  // *** CRITICAL FIX: The exact bucket name from your Supabase ***
  const BUCKET_NAME = 'order-attachments';

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      <FormSectionWrapper title="Customer Information">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
            <input type="text" {...register('designBacking')} className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange" />
          </div>
        </div>
        <div className="mt-6">
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* 1. Production Files */}
          <div className="md:col-span-2 bg-slate-800/30 p-4 rounded-xl border border-white/5">
            <label className="block text-sm font-bold text-brand-orange mb-3">Production Files (DST, EMB, PDF)</label>
            <FileUpload
              orderNumber={orderNum}
              bucketName={BUCKET_NAME} // <--- FIX: Uses correct bucket
              folderPath="production-files"
              initialFiles={watch('productionFileUrls') || []}
              onUploadComplete={(url) => updateFiles('productionFileUrls', url)}
              onFileRemove={(url) => removeFile('productionFileUrls', url)}
              label="Upload Production Files"
            />
          </div>

          {/* 2. Mockups */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Mockups / Proofs</label>
            <FileUpload
              orderNumber={orderNum}
              bucketName={BUCKET_NAME} // <--- FIX
              folderPath="mockups"
              initialFiles={watch('mockupUrls') || []}
              onUploadComplete={(url) => updateFiles('mockupUrls', url)}
              onFileRemove={(url) => removeFile('mockupUrls', url)}
              label="Upload Mockups (JPG, PNG, PDF)"
            />
          </div>

          {/* 3. Customer References */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Customer References</label>
            <FileUpload
              orderNumber={orderNum}
              bucketName={BUCKET_NAME} // <--- FIX
              folderPath="customer-refs"
              initialFiles={watch('customerAttachmentUrls') || []}
              onUploadComplete={(url) => updateFiles('customerAttachmentUrls', url)}
              onFileRemove={(url) => removeFile('customerAttachmentUrls', url)}
              label="Upload Customer Files"
            />
          </div>
          
          {/* 4. Shipping Labels */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-300 mb-2">Shipping Attachments / Labels</label>
             <FileUpload
              orderNumber={orderNum}
              bucketName={BUCKET_NAME} // <--- FIX
              folderPath="shipping-docs"
              initialFiles={watch('shippingAttachmentUrls') || []}
              onUploadComplete={(url) => updateFiles('shippingAttachmentUrls', url)}
              onFileRemove={(url) => removeFile('shippingAttachmentUrls', url)}
              label="Upload Shipping Labels (PDF, JPG, PNG)"
            />
          </div>

        </div>
      </FormSectionWrapper>

      {canViewFinancials && (
        <FormSectionWrapper title="Financials">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div><label className="block text-xs text-slate-400">Order Amount</label><input type="number" step="0.01" {...register('orderAmount', { valueAsNumber: true })} className="w-full bg-slate-800 border-slate-600 rounded-md text-white" /></div>
            <div><label className="block text-xs text-slate-400">Amount Paid</label><input type="number" step="0.01" {...register('amountPaid', { valueAsNumber: true })} className="w-full bg-slate-800 border-slate-600 rounded-md text-white" /></div>
            <div><label className="block text-xs text-slate-400">Production Cost</label><input type="number" step="0.01" {...register('productionCost', { valueAsNumber: true })} className="w-full bg-slate-800 border-slate-600 rounded-md text-white" /></div>
            <div><label className="block text-xs text-slate-400">Shipping Cost</label><input type="number" step="0.01" {...register('shippingCost', { valueAsNumber: true })} className="w-full bg-slate-800 border-slate-600 rounded-md text-white" /></div>
            <div className="col-span-2 md:col-span-4"><label className="block text-xs text-slate-400">Marketing Cost</label><input type="number" step="0.01" {...register('marketingCost', { valueAsNumber: true })} className="w-full bg-slate-800 border-slate-600 rounded-md text-white" /></div>
          </div>
          <div className="grid grid-cols-2 gap-6 pt-4 mt-4 border-t border-slate-700">
            <div><p className="text-xs text-slate-500">Remaining</p><p className="text-xl font-bold text-amber-400">${amountRemaining.toFixed(2)}</p></div>
            <div><p className="text-xs text-slate-500">Profit</p><p className={`text-xl font-bold ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>${profit.toFixed(2)}</p></div>
          </div>
        </FormSectionWrapper>
      )}

      <FormSectionWrapper title="Order Status">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-300">Status</label>
            <select {...register('status')} className="mt-1 block w-full bg-slate-800 border-slate-600 rounded-md text-white focus:ring-brand-orange focus:border-brand-orange">
              {Object.values(OrderStatus).map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
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
      </FormSectionWrapper>

      <div className="flex justify-end gap-4 pt-6 border-t border-slate-700">
        <Button type="button" variant="secondary" onClick={() => reset(formDefaultValues)}>Cancel</Button>
        <Button type="submit" disabled={isSaving}>{isSaving ? <Spinner small /> : 'Save Changes'}</Button>
      </div>
    </form>
  );
};

export default OrderForm;