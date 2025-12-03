import React, { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';

// Contexts & Hooks
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { useWarnIfUnsaved } from '../hooks/useWarnIfUnsaved';

// Services & Types
import { supabase } from '../services/supabaseClient';
import { updateOrderDetails } from '../services/orderService';
import { Order } from '../types';

// Components
import OrderForm, { SaveData } from '../components/orders/OrderForm';
import Spinner from '../components/ui/Spinner';
import UnsavedChangesModal from '../components/ui/UnsavedChangesModal';
import Button from '../components/ui/Button';
import GlassCard from '../components/ui/GlassCard';

const EditOrderPage: React.FC = () => {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const { user, role, permissions } = useAuth(); // ✅ Get Permissions
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  // ✅ CRITICAL FIX: 
  // Allow if user is ADMIN -OR- if user has 'view_financials' tick mark
  const canViewFinancials = role === 'ADMIN' || permissions?.orders_edit_financials === true;

  // State for Unsaved Changes
  const [isDirty, setIsDirty] = useState(false);
  const [allowNavigation, setAllowNavigation] = useState(false);
  const [navigateTo, setNavigateTo] = useState<string | null>(null); // NEW: For synchronized navigation
  const { showModal, confirmLeave, cancelLeave } = useWarnIfUnsaved(isDirty, allowNavigation);

  // State for Saving
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<Error | null>(null);

  // FETCH DATA
  // This effect ensures navigation only happens after the state is clean.
  useEffect(() => {
    if (navigateTo && allowNavigation) {
      navigate(navigateTo, { replace: true });
    }
  }, [navigateTo, allowNavigation, navigate]);

  const { data: order, isLoading, error: fetchError } = useQuery<Order | null, Error>({
    queryKey: ['order', orderNumber],
    queryFn: async () => {
      if (!orderNumber) throw new Error("Order number is required.");
      
      const { data, error } = await supabase
        .from('orders_with_details')
        .select('*')
        .eq('order_number', orderNumber)
        .single();

      if (error) throw error;
      return data as Order;
    },
    enabled: !!orderNumber,
  });

  // HANDLE SAVE
  const handleSave = async (formData: SaveData) => {
    if (!order) return;

    setIsSaving(true);
    setSaveError(null);

      // Map Form Data
      
      const dbPayload = {
        // --- COMMON FIELDS (Everyone can edit) ---
        customer_name: formData.customerName,
        customer_email: formData.customerEmail,
        customer_phone: formData.customerPhone,
        customer_profile_url: formData.customerProfileUrl,
        
        shipping_address: formData.shippingAddress,
        shipping_carrier: formData.shippingCarrier,
        shipping_tracking_number: formData.shippingTrackingNumber,
        
        design_name: formData.designName,
        patches_quantity: formData.patchesQuantity,
        patches_type: formData.patchesType,
        design_size: formData.designSize,
        design_backing: formData.designBacking,
        instructions: formData.instructions,
        
        lead_source: formData.leadSource,
        status: formData.status.toString(),
        is_urgent: formData.isUrgent,
        
        reason_category: formData.reasonCategory,
        reason_details: formData.reasonDetails,
        
        mockup_urls: formData.mockupUrls,
        production_file_urls: formData.productionFileUrls,
        shipping_attachment_urls: formData.shippingAttachmentUrls,
        customer_attachment_urls: formData.customerAttachmentUrls,

        // --- FINANCIAL FIELDS (Protected Logic) ---
        // If they have permission, save the Form Data.
        // If they DO NOT have permission, keep the existing Database Data (don't overwrite with 0)
        order_amount: canViewFinancials ? formData.orderAmount : order.orderAmount,
        amount_paid: canViewFinancials ? formData.amountPaid : order.amountPaid,
        production_cost: canViewFinancials ? formData.productionCost : order.productionCost,
        shipping_cost: canViewFinancials ? formData.shippingCost : order.shippingCost,
        marketing_cost: canViewFinancials ? formData.marketingCost : order.marketingCost,
      };

    try {
      // Call Service
      const savedOrder = await updateOrderDetails(order.id, dbPayload, order, user?.email || 'unknown');
      
      // On success, clear the dirty flag so the user can navigate away freely.
      // We do NOT navigate programmatically, allowing the user to stay on the page.
      setAllowNavigation(true);
      setIsDirty(false);
      
      toast.success('Order Updated', 'Changes saved successfully.');
      // ✅ FIX: Use state to navigate, preventing a race condition with the unsaved changes modal.
      setNavigateTo(`/order/${savedOrder.orderNumber}`);
      
      // Invalidate queries to refetch fresh data
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['allOrders'] }),
        queryClient.invalidateQueries({ queryKey: ['allOrdersReport'] }),
        queryClient.invalidateQueries({ queryKey: ['order', savedOrder.orderNumber] })
      ]);

    } catch (err: any) {
      console.error("Save failed:", err);
      setSaveError(err);
      toast.error('Update Failed', err.message || 'Could not save changes.');
    } finally {
      // ✅ CRITICAL FIX: Always stop the spinner, whether the save
      // succeeded or failed. This prevents an infinite loading state.
      setIsSaving(false);
    }
  };

  const onFormChange = useCallback(() => {
    // 🛡️ SHIELD: If we are currently saving (or finished saving), ignore changes.
    if (isSaving) return; 

    if (!isDirty) {
      setIsDirty(true);
      setAllowNavigation(false);
    }
  }, [isDirty, isSaving]);
  
  if (isLoading) return <div className="flex justify-center items-center h-screen"><Spinner /></div>;
  
  if (fetchError || !order) {
    return (
      <div className="text-center py-10 px-6 bg-red-900/30 text-red-200 rounded-lg shadow-md m-8">
        <h3 className="text-xl font-semibold">Could not load order</h3>
        <p className="mt-2 text-sm max-w-2xl mx-auto">
          {fetchError?.message || "Order not found"}
        </p>
        <div className="mt-6"><Link to="/orders"><Button variant="secondary">Back to All Orders</Button></Link></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold text-white">
          Edit Order <span className="text-brand-orange">{order.orderNumber}</span>
        </h2>
        <Link to={`/order/${order.orderNumber}`}>
          <Button variant="secondary">Cancel & Go Back</Button>
        </Link>
      </div>

      <UnsavedChangesModal show={showModal} onConfirm={confirmLeave} onCancel={cancelLeave} />
      
      {saveError && (
        <div className="p-4 bg-red-500/10 border-l-4 border-red-500 text-red-300 rounded-r-lg" role="alert">
          <h3 className="font-bold">An Error Occurred</h3>
          <p>{saveError.message}</p>
        </div>
      )}
      
      <GlassCard padding="lg">
        <OrderForm 
          initialData={order}
          onSave={handleSave} 
          isSaving={isSaving} 
          onFormChange={onFormChange} 
          
          // ✅ PASS THE PERMISSION: Admin OR Financial User = TRUE
          showFinancials={canViewFinancials} 
        />
      </GlassCard>
    </div>
  );
};

export default EditOrderPage;