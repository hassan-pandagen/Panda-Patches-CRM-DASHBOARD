// src/components/orders/OrderForm.tsx
import React, { useState, useEffect } from 'react';
import { Order } from '@/types';
import { OrderSummary } from '@/types';
import {
  DESIGN_BACKING_OPTIONS,
  PATCHES_TYPE_OPTIONS,
  COURIER_OPTIONS,
} from '@/constants';
import { useAuth } from '@/contexts/AuthContext';
import { uploadFile, deleteFile } from '@/services/storageService';
import Spinner from '@/components/ui/Spinner';
import { useDebounce } from '@/hooks';
import { getOrdersByCustomer } from '@/services/orderService';

// ──────────────────────────────────────
// Helper Prop Interfaces
// ──────────────────────────────────────
interface FormInputProps {
  name: string;
  label: string;
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  required?: boolean;
  readOnly?: boolean;
  step?: string;
}
interface FormTextareaProps {
  name: string;
  label: string;
  value: string | undefined;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  rows?: number;
}
interface FormSelectProps {
  name: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: string[];
}

// ──────────────────────────────────────
// Helper Components
// ──────────────────────────────────────
const FormInput: React.FC<FormInputProps> = ({
  name,
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  readOnly = false,
  step = 'any',
}) => (
  <div>
    <label
      htmlFor={name}
      className="block text-gray-400 font-medium tracking-wide mb-2 text-sm"
    >
      {label}
    </label>
    <input
      type={type}
      id={name}
      name={name}
      value={value}
      onChange={onChange}
      required={required}
      readOnly={readOnly}
      step={type === 'number' ? step : undefined}
      className={`w-full bg-slate-900/70 text-gray-100 placeholder-gray-500 border border-slate-700/80 rounded-lg px-3 py-2 focus:border-[#BC13FE] focus:ring-1 focus:ring-[#BC13FE] focus:animate-pulse transition-all duration-200 ease-in-out ${
        readOnly ? 'cursor-not-allowed bg-slate-700' : ''
      }`}
    />
  </div>
);

const FormTextarea: React.FC<FormTextareaProps> = ({
  name,
  label,
  value,
  onChange,
  rows = 3,
}) => (
  <div>
    <label
      htmlFor={name}
      className="block text-sm font-medium text-gray-400 mb-2"
    >
      {label}
    </label>
    <textarea
      id={name}
      name={name}
      value={value}
      onChange={onChange}
      rows={rows}
      className="w-full bg-slate-900/70 text-gray-100 placeholder-gray-500 border border-slate-700/80 rounded-lg px-3 py-2 focus:border-[#BC13FE] focus:ring-1 focus:ring-[#BC13FE] focus:animate-pulse transition-all duration-200 ease-in-out"
    />
  </div>
);

const FormToggle: React.FC<{
  name: string;
  label: string;
  checked: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}> = ({ name, label, checked, onChange }) => (
  <label
    htmlFor={name}
    className="flex items-center justify-between cursor-pointer"
  >
    <span className="text-gray-400 font-medium tracking-wide text-sm">
      {label}
    </span>
    <div className="relative">
      <input
        type="checkbox"
        id={name}
        name={name}
        checked={checked}
        onChange={onChange}
        className="sr-only peer"
      />
      <div className="w-11 h-6 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
    </div>
  </label>
);

const FormSelect: React.FC<FormSelectProps> = ({
  name,
  label,
  value,
  onChange,
  options,
}) => (
  <div>
    <label
      htmlFor={name}
      className="block text-sm font-medium text-gray-400 mb-2"
    >
      {label}
    </label>
    <div className="relative group">
      <select
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        className="w-full appearance-none bg-slate-900/70 text-gray-100 border border-slate-700/80 rounded-lg px-3 py-2 focus:border-[#BC13FE] focus:ring-1 focus:ring-[#BC13FE] focus:animate-pulse transition-all duration-200 ease-in-out cursor-pointer hover:border-slate-600 group-hover:shadow-[0_0_10px_rgba(188,19,254,0.2)]"
      >
        {options.map((opt) => (
          <option 
            key={opt} 
            value={opt} 
            className="bg-slate-900 text-gray-100 py-2"
          >
            {opt || 'Select...'}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 group-hover:text-[#BC13FE] transition-colors duration-200">
        <svg 
          className="h-4 w-4 fill-current" 
          viewBox="0 0 20 20"
        >
          <path 
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" 
            clipRule="evenodd" 
            fillRule="evenodd"
          >
          </path>
        </svg>
      </div>
      
      {/* Custom glow effect */}
      <div className="absolute inset-0 rounded-lg bg-[#BC13FE] opacity-0 group-hover:opacity-5 group-focus-within:opacity-10 transition-opacity duration-200 pointer-events-none"></div>
    </div>
  </div>
);

// ──────────────────────────────────────
// Types
// ──────────────────────────────────────
type FormState = Omit<
  Order,
  | 'id'
  | 'orderNumber'
  | 'createdAt'
  | 'updatedAt'
  | 'status'
  | 'amountRemaining'
  | 'patchesQuantity'
  | 'orderAmount'
  | 'amountPaid'
> & {
  id?: number;
  patchesQuantity: string;
  orderAmount: string;
  amountPaid: string;
};

export type SaveData = Omit<
  Order,
  'orderNumber' | 'createdAt' | 'updatedAt' | 'status' | 'amountRemaining' | 'id'
> & {
  id?: number;
};

interface OrderFormProps {
  onSave: (formData: SaveData) => void;
  initialData?: Partial<Order>;
  isSaving?: boolean;
  onFormChange?: () => void;
}

type AttachmentField =
  | 'customerAttachmentURLs'
  | 'redoAttachments'
  | 'mockupURLs';

const XIcon: React.FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-3 w-3"
    viewBox="0 0 20 20"
    fill="currentColor"
  >
    <path
      fillRule="evenodd"
      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
      clipRule="evenodd"
    />
  </svg>
);

// ──────────────────────────────────────
// Main Component
// ──────────────────────────────────────
const OrderForm: React.FC<OrderFormProps> = ({
  onSave,
  initialData,
  isSaving,
  onFormChange,
}) => {
  const { user, role } = useAuth();

  const [formData, setFormData] = useState<FormState>({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    shippingAddress: '',
    designName: '',
    designSize: '',
    designBacking: DESIGN_BACKING_OPTIONS[0],
    patchesType: PATCHES_TYPE_OPTIONS[0],
    patchesQuantity: '100',
    revisionNotes: '',
    customerAttachmentURLs: [],
    mockupURLs: [],
    redoNotes: '',
    redoAttachments: [],
    instructions: '',
    packing: '',
    trackingNumber: '',
    courier: COURIER_OPTIONS[0],
    orderAmount: '0',
    amountPaid: '0',
    salesAgent: user?.email || '',
    created_by: user?.id || '',
    is_urgent: false,
    is_urgent_approved: false,
    leadSource: '',
    customerProfileUrl: '',
  });

  const [uploadingField, setUploadingField] =
    useState<AttachmentField | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [customerHistory, setCustomerHistory] =
    useState<OrderSummary[] | null>(null);
  const debouncedEmail = useDebounce(formData.customerEmail, 500);
  const debouncedPhone = useDebounce(formData.customerPhone || '', 500);

  // ── Populate on edit ──
  useEffect(() => {
    if (initialData) {
      setFormData({
        id: initialData.id,
        created_by: initialData.created_by || user?.id || '',
        customerName: initialData.customerName || '',
        customerEmail: initialData.customerEmail || '',
        customerPhone: initialData.customerPhone || '',
        shippingAddress: initialData.shippingAddress || '',
        designName: initialData.designName || '',
        designSize: initialData.designSize || '',
        designBacking:
          initialData.designBacking || DESIGN_BACKING_OPTIONS[0],
        patchesType: initialData.patchesType || PATCHES_TYPE_OPTIONS[0],
        revisionNotes: initialData.revisionNotes || '',
        customerAttachmentURLs:
          initialData.customerAttachmentURLs || [],
        mockupURLs: initialData.mockupURLs || [],
        redoNotes: initialData.redoNotes || '',
        redoAttachments: initialData.redoAttachments || [],
        instructions: initialData.instructions || '',
        packing: initialData.packing || '',
        trackingNumber: initialData.trackingNumber || '',
        courier: initialData.courier || COURIER_OPTIONS[0],
        salesAgent: initialData.salesAgent || user?.email || '',
        patchesQuantity: String(initialData.patchesQuantity ?? '100'),
        orderAmount: String(initialData.orderAmount ?? '0'),
        amountPaid: String(initialData.amountPaid ?? '0'),
        is_urgent: initialData.is_urgent ?? false,
        is_urgent_approved: initialData.is_urgent_approved ?? false,
        leadSource: initialData.leadSource || '',
        customerProfileUrl: initialData.customerProfileUrl || '',
      });
    }
  }, [initialData, user]);

  // ── Customer history ──
  useEffect(() => {
    const fetchHistory = async () => {
      const hasEmail = debouncedEmail && debouncedEmail.includes('@');
      const hasPhone = debouncedPhone && debouncedPhone.length > 5;

      if (hasEmail || hasPhone) {
        const history = await getOrdersByCustomer(
          debouncedEmail,
          debouncedPhone
        );
        setCustomerHistory(history);
      } else {
        setCustomerHistory(null);
      }
    };

    if (!initialData?.id) fetchHistory();
  }, [debouncedEmail, debouncedPhone, initialData?.id]);

  // ── Handlers ──
  const handleChange = (
    e:
      | React.ChangeEvent<HTMLInputElement>
      | React.ChangeEvent<HTMLTextAreaElement>
      | React.ChangeEvent<HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const { checked } = e.target as HTMLInputElement;
      setFormData((p) => ({ ...p, [name]: checked }));
    } else {
      setFormData((p) => ({ ...p, [name]: value }));
    }
    onFormChange?.();
  };

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: AttachmentField
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingField(field);
    setUploadError(null);
    try {
      const url = await uploadFile(file);
      setFormData((p) => ({
        ...p,
        [field]: [...(p[field] ?? []), url],
      }));
    } catch (err) {
      console.error(err);
      setUploadError('Upload failed. Try again.');
    } finally {
      setUploadingField(null);
    }
  };

  const handleDeleteFile = async (
    url: string,
    field: AttachmentField
  ) => {
    setFormData((p) => ({
      ...p,
      [field]: (p[field] ?? []).filter((u) => u !== url),
    }));
    try {
      await deleteFile(url);
    } catch (err) {
      console.error(err);
      setFormData((p) => ({
        ...p,
        [field]: [...(p[field] ?? []), url],
      }));
      setUploadError('Could not delete file.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: SaveData = {
      ...formData,
      patchesQuantity: parseInt(formData.patchesQuantity, 10) || 0,
      orderAmount: parseFloat(formData.orderAmount) || 0,
      amountPaid: parseFloat(formData.amountPaid) || 0,
    };
    onSave(data);
  };

  // ── FileUploadInput ──
  const FileUploadInput: React.FC<{
    field: AttachmentField;
    label: string;
  }> = ({ field, label }) => (
    <div>
      <label className="block text-sm font-medium text-gray-400 mb-2">
        {label}
      </label>

      <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-[#BC13FE] rounded-lg p-6 bg-slate-900/40 text-gray-300 text-center transition-all duration-200 ease-in-out">
        <p className="text-gray-400 text-sm mb-2">
          Drag & drop or click to upload
        </p>
        <label
          htmlFor={field}
          className="cursor-pointer px-4 py-2 bg-[#BC13FE]/80 hover:bg-[#BC13FE]/90 text-white rounded-lg transition-all duration-200 shadow-[0_0_10px_rgba(188,19,254,0.3)]"
        >
          Choose File
          <input
            id={field}
            type="file"
            className="hidden"
            onChange={(e) => handleFileChange(e, field)}
          />
        </label>
      </div>

      {uploadingField === field && (
        <div className="mt-2 flex items-center gap-2 text-sm text-gray-500">
          <Spinner small /> <span>Uploading...</span>
        </div>
      )}

      {(formData[field] ?? []).length > 0 && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {(formData[field] ?? []).map((url, idx) => (
            <div key={idx} className="relative group">
              <img
                src={url}
                alt={`Attachment ${idx + 1}`}
                className="rounded-lg object-cover h-24 w-full"
              />
              <button
                type="button"
                onClick={() => handleDeleteFile(url, field)}
                className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <XIcon />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── JSX ──
  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Customer & Source */}
      <div className="border border-slate-700/60 bg-slate-900/50 rounded-xl p-6 shadow-inner shadow-black/20">
        <h3 className="text-xl font-semibold tracking-wide text-gray-100 mb-4">
          Customer & Source
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormInput
            name="customerName"
            label="Customer Name"
            value={formData.customerName}
            onChange={handleChange}
            required
          />
          <FormInput
            name="customerEmail"
            label="Customer Email"
            value={formData.customerEmail}
            onChange={handleChange}
            type="email"
            required
          />
          {customerHistory && customerHistory.length > 0 && (
            <div className="md:col-span-2 -mt-4">
              <div className="bg-blue-500/10 border border-blue-500/20 text-blue-300 text-sm rounded-lg px-4 py-2">
                Returning customer with{' '}
                <strong>{customerHistory.length}</strong> previous order(s).
              </div>
            </div>
          )}
          <FormSelect
            name="leadSource"
            label="Order Source"
            value={formData.leadSource || ''}
            onChange={handleChange}
            options={[
              '',
              'Ring Central',
              'WhatsApp',
              'Facebook',
              'TikTok',
              'Other',
            ]}
          />
          <FormInput
            name="customerProfileUrl"
            label="Profile Link"
            value={formData.customerProfileUrl || ''}
            onChange={handleChange}
          />
          <FormInput
            name="customerPhone"
            label="Customer Phone"
            value={formData.customerPhone || ''}
            onChange={handleChange}
          />
          <div className="md:col-span-2">
            <FormTextarea
              name="shippingAddress"
              label="Shipping Address"
              value={formData.shippingAddress || ''}
              onChange={handleChange}
              rows={2}
            />
          </div>
        </div>
      </div>

      {/* Design & Product */}
      <div className="border border-slate-700/60 bg-slate-900/50 rounded-xl p-6 shadow-inner shadow-black/20">
        <h3 className="text-xl font-semibold tracking-wide text-gray-100 mb-4">
          Design & Product
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormInput
            name="designName"
            label="Design Name"
            value={formData.designName}
            onChange={handleChange}
            required
          />
          <div className="flex items-center pt-6">
            <FormToggle
              name="is_urgent"
              label="Urgent Order"
              checked={formData.is_urgent}
              onChange={handleChange}
            />
          </div>
          <FormInput
            name="patchesQuantity"
            label="Quantity"
            value={formData.patchesQuantity}
            onChange={handleChange}
            type="number"
            required
          />
          <FormSelect
            name="patchesType"
            label="Type"
            value={formData.patchesType || ''}
            onChange={handleChange}
            options={PATCHES_TYPE_OPTIONS}
          />
          <FormInput
            name="designSize"
            label="Size (e.g., 3x2 inches)"
            value={formData.designSize || ''}
            onChange={handleChange}
          />
          <FormSelect
            name="designBacking"
            label="Backing"
            value={formData.designBacking || ''}
            onChange={handleChange}
            options={DESIGN_BACKING_OPTIONS}
          />
          <div className="md:col-span-2">
            <FormTextarea
              name="instructions"
              label="Special Instructions"
              value={formData.instructions || ''}
              onChange={handleChange}
            />
          </div>
          <div className="md:col-span-2">
            <FileUploadInput
              field="customerAttachmentURLs"
              label="Customer Attachments"
            />
          </div>
          <div className="md:col-span-2">
            <FileUploadInput field="mockupURLs" label="Mockup Designs" />
          </div>
        </div>
      </div>

      {/* Revisions & Redos */}
      <div className="border border-slate-700/60 bg-slate-900/50 rounded-xl p-6 shadow-inner shadow-black/20">
        <h3 className="text-xl font-semibold tracking-wide text-gray-100 mb-4">
          Revisions & Redos
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="mds:col-span-2">
            <FormTextarea
              name="revisionNotes"
              label="Revision Notes (from customer)"
              value={formData.revisionNotes || ''}
              onChange={handleChange}
            />
          </div>
          <div className="md:col-span-2">
            <FormTextarea
              name="redoNotes"
              label="Redo Notes (internal)"
              value={formData.redoNotes || ''}
              onChange={handleChange}
            />
          </div>
          <div className="md:col-span-2">
            <FileUploadInput field="redoAttachments" label="Redo Attachments" />
          </div>
        </div>
      </div>

      {/* Shipping */}
      <div className="border border-slate-700/60 bg-slate-900/50 rounded-xl p-6 shadow-inner shadow-black/20">
        <h3 className="text-xl font-semibold tracking-wide text-gray-100 mb-4">
          Shipping
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormSelect
            name="courier"
            label="Courier"
            value={formData.courier || ''}
            onChange={handleChange}
            options={COURIER_OPTIONS}
          />
          <FormInput
            name="trackingNumber"
            label="Tracking Number"
            value={formData.trackingNumber || ''}
            onChange={handleChange}
          />
        </div>
      </div>

      {/* Financials */}
      {(role === 'ADMIN' || role === 'AGENT') && (
        <div className="border border-slate-700/60 bg-slate-900/50 rounded-xl p-6 shadow-inner shadow-black/20">
          <h3 className="text-xl font-semibold tracking-wide text-gray-100 mb-4">
            Financials
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FormInput
              name="orderAmount"
              label="Total Amount ($)"
              value={formData.orderAmount}
              onChange={handleChange}
              type="number"
              step="0.01"
              required
            />
            <FormInput
              name="amountPaid"
              label="Amount Paid ($)"
              value={formData.amountPaid}
              onChange={handleChange}
              type="number"
              step="0.01"
              required
            />
            <FormInput
              name="amountRemaining"
              label="Remaining ($)"
              value={(
                parseFloat(formData.orderAmount) -
                  parseFloat(formData.amountPaid) || 0
              ).toFixed(2)}
              onChange={() => {}}
              readOnly
            />
            <FormInput
              name="salesAgent"
              label="Sales Agent"
              value={formData.salesAgent}
              onChange={handleChange}
              readOnly
            />
          </div>
        </div>
      )}

      {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}

      {/* Actions */}
      <div className="flex justify-end gap-4">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="px-4 py-2 rounded-lg bg-slate-800/60 border border-slate-700/60 text-gray-300 hover:text-[#BC13FE] hover:border-[#BC13FE] transition-all duration-300 active:scale-95"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="px-4 py-2 rounded-lg bg-gradient-to-br from-[#BC13FE] to-purple-600 text-white font-medium hover:from-purple-600 hover:to-[#BC13FE] focus:ring-2 focus:ring-[#BC13FE]/50 shadow-[0_0_15px_rgba(188,19,254,0.3)] transition-all duration-300 ease-in-out disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 active:scale-95"
        >
          {isSaving ? (
            <>
              <Spinner small /> Saving...
            </>
          ) : (
            'Save Order'
          )}
        </button>
      </div>
    </form>
  );
};

export default OrderForm;