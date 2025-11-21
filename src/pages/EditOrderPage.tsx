// src/pages/EditOrderPage.tsx - FINAL VERSION WITH CORRECTED IMPORTS

import React, { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useParams, useNavigate, Link } from 'react-router-dom';
// 1. Import useQuery and useMutation for modern state management
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { updateOrderDetails } from '../services/orderService'; // <--- Use the new service
import { Order } from '../types';
// 1. Correct the import to use a named import for OrderForm and its type
import OrderForm, { SaveData } from '../components/orders/OrderForm';
import Spinner from '../components/ui/Spinner';
import { useWarnIfUnsaved } from '../components/layout/useWarnIfUnsaved';
import UnsavedChangesModal from '../components/ui/UnsavedChangesModal';
import Button from '../components/ui/Button'; // Assuming you have a standard Button component
// Add the missing import for GlassCard
import GlassCard from '../components/ui/GlassCard'; 

// Mock toast functions since they are in the request but not the file
// In a real app, you'd import this from a library like 'react-hot-toast'
const toast = {
  success: (title: string, message: string) => console.log(`SUCCESS: ${title} - ${message}`),
  error: (title: string, message: string) => console.error(`ERROR: ${title} - ${message}`),
};

// A mock getOrder function since it's not in the provided orderService.ts
const getOrder = async (orderNumber: string): Promise<Order | null> => {
  // This would fetch from supabase in a real scenario
  console.log(`Fetching order ${orderNumber}`);
  return null; 
};

const EditOrderPage: React.FC = () => {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const { user } = useAuth(); // Get the user's role
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isDirty, setIsDirty] = useState(false);
  const { showModal, confirmLeave, cancelLeave } = useWarnIfUnsaved(isDirty);

  // Use `useQuery` to fetch the order data.
  // This handles loading, error, and caching automatically.
  const { data: order, isLoading, error: fetchError } = useQuery<Order | null, Error>({
    queryKey: ['order', orderNumber],
    queryFn: () => {
      if (!orderNumber) throw new Error("Order number is required.");
      return getOrder(orderNumber);
    },
    enabled: !!orderNumber,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<Error | null>(null);

  const handleSave = async (formData: any) => {
    if (!order) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      // USE THE SERVICE FUNCTION
      // We pass: ID, New Data, Old Data (for comparison), User Email
      const savedOrder = await updateOrderDetails(order.id, formData, order, user?.email || 'unknown');
      
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ['allOrders'] });
      queryClient.invalidateQueries({ queryKey: ['allOrdersReport'] });
      queryClient.invalidateQueries({ queryKey: ['order', savedOrder.orderNumber] });

      toast.success('Order Updated', 'Changes saved successfully.');
      navigate(`/order/${savedOrder.orderNumber}`);
    } catch (err: any) {
      setSaveError(err);
      toast.error('Update Failed', 'Could not save changes.');
      setIsDirty(true);
    }
    setIsSaving(false);
  };

  const onFormChange = useCallback(() => {
    if (!isDirty) setIsDirty(true);
  }, [isDirty]);
  
  if (isLoading) {
    return <div className="flex justify-center items-center h-64"><Spinner /></div>;
  }
  
  if (fetchError) {
    return (
      <div className="text-center py-10 px-6 bg-red-900/30 text-red-200 rounded-lg shadow-md">
        <h3 className="text-xl font-semibold">Could not load order for editing</h3>
        <p className="mt-2 text-sm max-w-2xl mx-auto">{fetchError.message}</p>
        <div className="mt-6">
          <Link to="/orders">
            <Button variant="secondary">Back to All Orders</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!order) {
    return <p className="text-center">Order not found.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold text-white">
          Edit Order <span className="text-brand-orange">#{order.orderNumber}</span>
        </h2>
        <Link to="/orders">
          <Button variant="secondary">Back to All Orders</Button>
        </Link>
      </div>

      <UnsavedChangesModal 
        show={showModal}
        onConfirm={confirmLeave}
        onCancel={cancelLeave}
      />
      
      {saveError && (
        <div className="p-4 bg-red-500/10 border-l-4 border-red-500 text-red-300" role="alert">
          <h3 className="font-bold">An Error Occurred</h3>
          <p>{saveError.message}</p>
        </div>
      )}
      
      <GlassCard padding="lg">
        <OrderForm 
          onSave={handleSave} 
          // Safely pass initial data to pre-fill the form
          initialData={order}
          isSaving={isSaving} 
          onFormChange={onFormChange} 
        />
      </GlassCard>
    </div>
  );
};

export default EditOrderPage;