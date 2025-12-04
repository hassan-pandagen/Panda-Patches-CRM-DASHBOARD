// pages/EditOrderPage.tsx - FIXED TOAST USAGE

import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { Order, UserRole } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
// ✅ IMPORT THE ADAPTER
import { updateOrderDetails, mapDbToOrder } from '../services/orderService';

import OrderForm, { SaveData } from '../components/orders/OrderForm';
import Spinner from '../components/ui/Spinner';
import { ArrowLeft } from 'lucide-react';

const EditOrderPage: React.FC = () => {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, role, permissions } = useAuth();
  
  const { success, error: showError } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  // --- DATA FETCHING (The Standard Pattern) ---
  const { data: initialOrder, isLoading, error } = useQuery<Order, Error>({
    queryKey: ['order', orderNumber],
    queryFn: async () => {
      if (!orderNumber) throw new Error("No order number provided.");
      
      // ✅ 1. QUERY THE RAW TABLE (Snake Case)
      const { data, error } = await supabase
        .from('orders') // Table, not View
        .select('*')
        .eq('order_number', orderNumber) // snake_case column
        .single();

      if (error) throw error;

      // ✅ 2. MAP TO CAMEL CASE (The Adapter)
      return mapDbToOrder(data);
    },
    enabled: !!orderNumber,
  });

  // --- PERMISSION CHECKS ---
  // Matches the "Green Tick" logic from User Management
  const canEditFinancials = 
    role === UserRole.ADMIN || 
    permissions?.orders_edit_financials === true;

  // --- SAVE HANDLER ---
  const handleSave = async (formData: SaveData) => {
    if (!initialOrder || !user?.email) {
      showError('Cannot save order without initial data or user session.');
      return;
    }

    setIsSaving(true);
    
    try {
      // ✅ 3. SEND UPDATE (The Service handles Camel -> Snake conversion)
      const updatedOrder = await updateOrderDetails(
        initialOrder.id, 
        formData, 
        initialOrder, 
        user.email
      );
      
      success(`Order ${updatedOrder.orderNumber} updated successfully!`);
      
      // Refresh cache
      await queryClient.invalidateQueries({ queryKey: ['order', orderNumber] });
      await queryClient.invalidateQueries({ queryKey: ['allOrders'] });
      
      // ✅ CRITICAL FIX: Navigate back to order detail page after successful save
      // Give a small delay to let the success toast show
      setTimeout(() => {
        navigate(`/order/${orderNumber}`);
      }, 500);

    } catch (err: any) {
      console.error("💥 Save failed:", err);
      showError(err.message || 'An unknown error occurred while saving.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-10">
        <div className="text-red-400 mb-4">Error: {error.message}</div>
        <Link to="/orders" className="text-blue-400 hover:underline">
          Back to Orders
        </Link>
      </div>
    );
  }

  if (!initialOrder) {
    return (
      <div className="text-center py-10">
        <div className="text-slate-400 mb-4">Order not found</div>
        <Link to="/orders" className="text-blue-400 hover:underline">
          Back to Orders
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fadeIn">
      <Link 
        to={`/order/${orderNumber}`} 
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft size={16} /> Back to Order Details
      </Link>
      
      <h1 className="text-3xl font-bold text-white mb-8">
        Edit Order: <span className="text-brand-orange">{initialOrder.orderNumber}</span>
      </h1>
      
      <OrderForm 
        onSave={handleSave}
        initialData={initialOrder}
        isSaving={isSaving}
        showFinancials={canEditFinancials}
      />
    </div>
  );
};

export default EditOrderPage;