// src/pages/NewOrderPage.tsx - UPDATED FOR DUPLICATION

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom"; // Added useLocation
import { useQueryClient } from "@tanstack/react-query";
import { createOrder } from '../services/orderService';
import { Order, OrderStatus } from '../types/index';
import { queryKeys } from '../constants/queryKeys';
import OrderForm, { SaveData } from '../components/orders/OrderForm';
import GeneratePaymentLinkModal from '../components/orders/GeneratePaymentLinkModal';
import { useWarnIfUnsaved } from "../hooks";
import UnsavedChangesModal from "../components/ui/UnsavedChangesModal";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../hooks/useToast";
import { logger } from "../services/logger";
import { Copy, AlertTriangle, Inbox, FileText, X } from "lucide-react";

const NewOrderPage: React.FC = () => {
  const [isSaving, setIsSaving] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isDirty, setIsDirty] = React.useState(false);
  const [navigateTo, setNavigateTo] = React.useState<string | null>(null); // NEW: For synchronized navigation
  const [allowNavigation, setAllowNavigation] = React.useState(false); // NEW: For navigation shield
  // Attribution warning banner — dismissed per-user via localStorage so we don't nag forever
  const [showAttrWarning, setShowAttrWarning] = React.useState(
    typeof window !== 'undefined' && localStorage.getItem('attr_warning_dismissed') !== 'true'
  );
  
  const navigate = useNavigate();
  const location = useLocation(); // Hook to get the passed data
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { success: showSuccess } = useToast();
  
  const { showModal, confirmLeave, cancelLeave } = useWarnIfUnsaved(isDirty, allowNavigation);

  // This effect ensures navigation only happens after the state is clean.
  React.useEffect(() => {
    if (navigateTo && allowNavigation) {
      navigate(navigateTo);
    }
  }, [navigateTo, allowNavigation, navigate]);


  // --- DUPLICATION / BUILDER LOGIC ---
  // Re-order clones a past order; Add Order pre-fills the customer only. Both may run in the
  // "payment flow" (Add Order / Re-order from the customer page): on submit we set the order's
  // status per the processing mode and open the Square payment-link modal.
  const sourceOrder = location.state?.duplicateOrder as Order | undefined;
  const prefillCustomer = location.state?.prefillCustomer as {
    fullName?: string; email?: string; phone?: string;
    defaultShippingAddress?: string; country?: string; companyName?: string;
  } | undefined;
  const paymentFlow = !!location.state?.paymentFlow;
  const cameFromReorder = !!location.state?.isReorder;

  // 'wait' = hold as PENDING_PAYMENT until Square confirms; 'process' = go to production now, UNPAID.
  const [processingMode, setProcessingMode] = React.useState<'wait' | 'process'>('wait');
  // When set, the copy-link modal is open for the just-created order; navigate away on close.
  const [linkModalOrder, setLinkModalOrder] = React.useState<Order | null>(null);

  const initialData = React.useMemo(() => {
    if (sourceOrder) {
      // Clone a past order at its ORIGINAL prices (amountPaid reset). Customer/design/files kept.
      return {
        ...sourceOrder,
        id: 0,
        orderNumber: '',
        status: OrderStatus.NEW_ORDER,
        createdAt: '',
        updatedAt: '',
        shippingTrackingNumber: '',
        amountPaid: 0,
      } as Order;
    }
    if (prefillCustomer) {
      // Add Order: blank order pre-filled with the customer's account details.
      return {
        id: 0,
        orderNumber: '',
        status: OrderStatus.NEW_ORDER,
        createdAt: '',
        updatedAt: '',
        customerName: prefillCustomer.fullName || '',
        customerEmail: prefillCustomer.email || '',
        customerPhone: prefillCustomer.phone || '',
        shippingAddress: prefillCustomer.defaultShippingAddress || '',
        country: prefillCustomer.country || '',
      } as Order;
    }
    return null;
  }, [sourceOrder, prefillCustomer]);

  const handleSave = async (payload: { current: SaveData; isNew: boolean; changes: any[] }) => {
    setIsSaving(true);
    setError(null);

    try {
      // ✅ Extract the actual form data from the payload structure
      const formData = payload.current;

      // ✅ AUTO-DETECT REPEAT CUSTOMERS
      // Check if this customer has ordered before (by email or phone)
      let detectedLeadSource = formData.leadSource || '';
      let isReorderFlag = cameFromReorder; // true via the Re-order path, or if a prior order is found below

      if (formData.customerEmail || formData.customerPhone) {
        const { supabase } = await import('../services/supabaseClient');

        // Build query to find existing orders with matching email or phone
        let query = supabase
          .from('orders')
          .select('id')
          .limit(1);

        // Add filters for email or phone
        const filters = [];
        if (formData.customerEmail) {
          filters.push(`customer_email.eq.${formData.customerEmail}`);
        }
        if (formData.customerPhone) {
          filters.push(`customer_phone.eq.${formData.customerPhone}`);
        }

        if (filters.length > 0) {
          query = query.or(filters.join(','));
        }

        const { data: existingOrders } = await query;

        // If customer has ordered before, automatically set lead source to "Repeat Order"
        if (existingOrders && existingOrders.length > 0) {
          detectedLeadSource = 'Repeat Order';
          isReorderFlag = true; // spec: is_reorder is also true when the email matches a prior order
          console.log('🔄 Repeat customer detected! Auto-setting lead source to "Repeat Order"');
        }
      }

      // ✅ LAYER 4: Explicit Type Safety
      // Pass camelCase formData with explicit type casting, let service handle conversion

      const sanitizedFormData = {
        // Required String Fields (with type casting to ensure strings)
        customerName: String(formData.customerName || ''),
        customerEmail: String(formData.customerEmail || ''),
        customerPhone: String(formData.customerPhone || ''),
        customerProfileUrl: String(formData.customerProfileUrl || ''),
        purchaseOrder: String(formData.purchaseOrder || ''),
        ccEmail: String(formData.ccEmail || ''),

        // Shipping
        shippingAddress: String(formData.shippingAddress || ''),
        shippingCarrier: String(formData.shippingCarrier || ''),
        shippingTrackingNumber: String(formData.shippingTrackingNumber || ''),
        
        // Design & Product
        designName: String(formData.designName || ''),
        patchesQuantity: Number(formData.patchesQuantity) || 0,
        patchesType: String(formData.patchesType || ''),
        designSize: String(formData.designSize || ''),
        designBacking: String(formData.designBacking || ''),
        borderType: String(formData.borderType || ''),
        instructions: String(formData.instructions || ''),
        
        // Financials (with safe number conversion)
        orderAmount: Number(formData.orderAmount) || 0,
        amountPaid: Number(formData.amountPaid) || 0,
        productionCost: Number(formData.productionCost) || 0,
        shippingCost: Number(formData.shippingCost) || 0,
        marketingCost: Number(formData.marketingCost) || 0,
        
        // Status: in the payment flow the processing mode decides it (held as PENDING_PAYMENT
        // vs straight to production); otherwise keep the form's status.
        status: paymentFlow
          ? (processingMode === 'wait' ? OrderStatus.PENDING_PAYMENT : OrderStatus.NEW_ORDER)
          : String(formData.status || OrderStatus.NEW_ORDER),
        // Payment state (only in the payment flow) + reorder metric flag.
        ...(paymentFlow ? { paymentStatus: processingMode === 'wait' ? 'pending' : 'unpaid' } : {}),
        isReorder: isReorderFlag,

        // Lead & Urgency (use auto-detected lead source for repeat customers)
        leadSource: String(detectedLeadSource || ''),
        country: String(formData.country || ''),
        isUrgent: Boolean(formData.isUrgent),
        sampleBox: Boolean(formData.sampleBox),
        rushDate: formData.rushDate || null,
        
        // Arrays (ensure they are arrays)
        mockupUrls: Array.isArray(formData.mockupUrls) ? formData.mockupUrls : [],
        productionFileUrls: Array.isArray(formData.productionFileUrls) ? formData.productionFileUrls : [],
        shippingAttachmentUrls: Array.isArray(formData.shippingAttachmentUrls) ? formData.shippingAttachmentUrls : [],
        customerAttachmentUrls: Array.isArray(formData.customerAttachmentUrls) ? formData.customerAttachmentUrls : [],
        
        // Reasons
        reasonCategory: String(formData.reasonCategory || ''),
        reasonDetails: String(formData.reasonDetails || ''),
      };

      // Send the sanitized camelCase payload - service will convert to snake_case
      const newOrder = await createOrder(sanitizedFormData, user?.email || 'unknown');

      // ✅ SUCCESS SEQUENCE
      await queryClient.invalidateQueries({ queryKey: queryKeys.orders.all() });
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all() });
      setIsDirty(false);
      setAllowNavigation(true);

      if (paymentFlow) {
        // Open the Square payment-link modal for the new order; navigate once it closes.
        showSuccess(`Order ${newOrder.orderNumber} created — now generate the payment link`);
        setLinkModalOrder(newOrder);
      } else {
        showSuccess(`Order ${newOrder.orderNumber} created successfully!`);
        setNavigateTo(`/order/${newOrder.orderNumber}/edit`);
      }
      
    } catch (err: any) {
      logger.error('Failed to create order', err);
      const errorMessage = err?.message || (typeof err === 'string' ? err : 'An unknown error occurred. Check the console for details.');
      setError(`Failed to create order: ${errorMessage}`);
      setIsDirty(true);
    } finally {
      setIsSaving(false);
    }
  };

  const onFormChange = React.useCallback(() => {
    console.log('[NewOrderPage] onFormChange called, isSaving:', isSaving);
    if (isSaving) return;
    setIsDirty(true);
    setAllowNavigation(false);
    console.log('[NewOrderPage] Form became dirty');
  }, [isSaving]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-white flex items-center gap-3">
          {sourceOrder ? (
            <>
              <Copy className="w-8 h-8 text-blue-400" />
              <span>Repeat Order <span className="text-slate-400 text-lg font-normal">(Copying {sourceOrder.orderNumber})</span></span>
            </>
          ) : (
            "Create New Order"
          )}
        </h2>
        {sourceOrder && (
            <p className="text-slate-400 mt-1 ml-11">
                Details from the previous order have been pre-filled. Please review quantities and costs.
            </p>
        )}
      </div>
      
      <UnsavedChangesModal 
        show={showModal}
        onConfirm={confirmLeave}
        onCancel={cancelLeave}
      />
      
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border-l-4 border-red-500 text-red-300 rounded-r-lg">
          <h3 className="font-bold">Error</h3>
          <p>{error}</p>
        </div>
      )}

      {/* Attribution loss warning — only for fresh "New Order" (not for repeat orders).
          Teaches agents to use the Inbox/Quote flow when customer came from Meta. */}
      {showAttrWarning && !sourceOrder && (
        <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-amber-200 text-sm mb-1">
              Customer came from Facebook or Instagram?
            </h4>
            <p className="text-xs text-amber-200/80 leading-relaxed mb-3">
              Don't create the order here — you'll lose Meta ad attribution (no fbc) and CAPI Purchase
              fires with low quality. Instead, use the right flow so Meta knows which ad converted:
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate('/inbox')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-medium transition-all"
              >
                <Inbox className="w-3 h-3" />
                Open Inbox → Convert to Quote
              </button>
              <button
                type="button"
                onClick={() => navigate('/quotes')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 hover:bg-slate-700 text-slate-300 border border-white/10 rounded-lg text-xs font-medium transition-all"
              >
                <FileText className="w-3 h-3" />
                Open Quotes → Convert to Order
              </button>
              <span className="text-[10px] text-amber-200/60 self-center ml-2">
                Phone / WhatsApp / repeat customer? New Order is fine.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              localStorage.setItem('attr_warning_dismissed', 'true');
              setShowAttrWarning(false);
            }}
            className="p-1 text-amber-400/60 hover:text-amber-300 hover:bg-white/5 rounded transition-all shrink-0"
            title="Dismiss (won't show again)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {paymentFlow && (
        <div className="mb-6 bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-xl">
          <h3 className="text-sm font-bold text-white mb-1">Processing</h3>
          <p className="text-xs text-slate-400 mb-3">
            After you click Create Order below, choose the amount (full or deposit) and generate the Square link.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${processingMode === 'wait' ? 'border-brand-orange bg-brand-orange/10' : 'border-white/10 bg-slate-800/40 hover:bg-slate-800'}`}>
              <input type="radio" name="processingMode" checked={processingMode === 'wait'} onChange={() => setProcessingMode('wait')} className="mt-0.5" />
              <span className="text-xs text-slate-200">
                <span className="font-semibold">Wait for payment</span>
                <span className="block text-slate-400 mt-0.5">Order is held and not sent to production until Square confirms payment (deposit or full).</span>
              </span>
            </label>
            <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${processingMode === 'process' ? 'border-brand-orange bg-brand-orange/10' : 'border-white/10 bg-slate-800/40 hover:bg-slate-800'}`}>
              <input type="radio" name="processingMode" checked={processingMode === 'process'} onChange={() => setProcessingMode('process')} className="mt-0.5" />
              <span className="text-xs text-slate-200">
                <span className="font-semibold">Process without payment</span>
                <span className="block text-slate-400 mt-0.5">Order goes to production now, marked UNPAID; a payment link is still generated and the balance tracked.</span>
              </span>
            </label>
          </div>
        </div>
      )}

      {/* Pass the sanitized 'initialData' to the form to pre-fill it */}
      <OrderForm
        onSave={handleSave}
        isSaving={isSaving}
        onFormChange={onFormChange}
        initialData={initialData}
        isNewOrder={true}
      />

      {/* Payment flow: after the order is created, generate + share the Square link, then leave. */}
      {linkModalOrder && (
        <GeneratePaymentLinkModal
          isOpen={!!linkModalOrder}
          onClose={() => {
            const goTo = `/order/${linkModalOrder.orderNumber}`;
            setLinkModalOrder(null);
            setNavigateTo(goTo);
          }}
          mode="order"
          orderId={linkModalOrder.id}
          orderNumber={linkModalOrder.orderNumber}
          orderAmount={linkModalOrder.orderAmount ?? 0}
          amountAlreadyPaid={0}
          customerName={linkModalOrder.customerName}
          customerEmail={linkModalOrder.customerEmail}
          customerPhone={linkModalOrder.customerPhone ?? null}
        />
      )}
    </div>
  );
};

export default NewOrderPage;