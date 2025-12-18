// pages/EditOrderPage.tsx - FIXED TOAST USAGE

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from "../services/supabaseClient";
import { Order, UserRole } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../hooks/useToast";
import { queryKeys } from "../constants/queryKeys";
import { mapDbToOrder } from "../services/orderService";
import { updateOrderDetails } from '../services/orderService';
import OrderForm, { SaveData } from "../components/orders/OrderForm";
import Spinner from "../components/ui/Spinner";
import { ArrowLeft } from "lucide-react";

const EditOrderPage: React.FC = () => {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, role, permissions } = useAuth();

  const { success, error: showError } = useToast();
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);

  // --- DATA FETCHING (The Standard Pattern) ---
  const {
    data: initialOrder,
    isLoading,
    error,
  } = useQuery<Order, Error>({
    queryKey: queryKeys.orders.single(orderNumber), // FIX: Use the string orderNumber from the URL for the query key
    queryFn: async () => {
      if (!orderNumber) throw new Error("No order number provided.");

      // ✅ Query base table directly (industry standard, not the view)
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq('order_number', orderNumber)
        .single();

      if (error) throw error;

      // ✅ Map to frontend format
      return mapDbToOrder(data);
    },
    enabled: !!orderNumber,
  });

  // Fetch activity log (order history)
  const { data: activityLog } = useQuery({
    queryKey: queryKeys.orders.history(orderNumber), // FIX: Use the string orderNumber for consistency
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_history')
        .select('*')
        .eq('order_id', initialOrder?.id) // ✅ FIX: Use the actual order ID (bigint)
        .order('changed_at', { ascending: false });

      if (error) throw error;
      
      console.log('📊 Activity Log Fetched:', {
        timestamp: new Date().toISOString(),
        count: data?.length,
        latest: data?.[0]
      });
      
      return data;
    },
    enabled: !!initialOrder?.id, // ✅ FIX: Fetch only when the initial order ID is available
    // ✅ CRITICAL: Always refetch on mount and window focus
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0, // Consider data immediately stale
  });

  // Update order mutation
  const updateOrderMutation = useMutation({
    mutationFn: async (updateData: Partial<Order> & { [key: string]: any }) => {
      console.log('💾 Saving order with data:', updateData);
      
      // ✅ Import and use the service function that has email trigger logic
      return await updateOrderDetails(
        initialOrder!.id,
        updateData,
        initialOrder!,
        user?.email || 'unknown'
      );
    },
    onSuccess: async () => {
      console.log('✅ Save successful, invalidating queries...');
      
      // ✅ FIX 1: Invalidate all related queries
      await Promise.all([
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.orders.single(orderNumber) 
        }),
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.orders.history(orderNumber) 
        }),
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.orders.lists() 
        }),
      ]);

      // ✅ FIX 2: Force immediate refetch of activity log
      console.log('🔄 Force refetching activity log...');
      await queryClient.refetchQueries({ 
        queryKey: queryKeys.orders.history(orderNumber),
        type: 'active'
      });

      // ✅ FIX 3: Small delay to ensure database trigger has completed
      setTimeout(async () => {
        console.log('🔄 Second refetch after delay...');
        await queryClient.refetchQueries({ 
          queryKey: queryKeys.orders.history(orderNumber)
        });
      }, 500);

      setHasUnsavedChanges(false);
      success('Order Updated', 'Your changes have been saved successfully.');

      // ✅ FIX: Navigate back to the order details page after a successful save.
      navigate(`/order/${orderNumber}`);
    },
    onError: (error: any) => {
      console.error('❌ Save failed:', error);
      showError(error.message || 'Failed to update order');
    },
  });

  // --- PERMISSION CHECKS ---
  // Matches the "Green Tick" logic from User Management
  const canEditFinancials =
    role === UserRole.ADMIN || permissions?.orders_edit_financials === true;

  // ✅ Sales Agents with both permissions can edit all fields
  const canEditAll = 
    role === UserRole.ADMIN || 
    (permissions?.orders_edit_production === true && 
     permissions?.orders_edit_financials === true);

  // --- SAVE HANDLER ---
  const handleSave = async (data: { current: any; isNew: boolean }) => {
    console.log('📝 handleSave called with:', data);

    try {
      // The `updateOrderDetails` service function expects a camelCase object.
      const camelCaseData = data.current;
      console.log('🗄️ Service payload (camelCase):', camelCaseData);
      
      await updateOrderMutation.mutateAsync(camelCaseData);
    } catch (error) {
      console.error('💥 Save error:', error);
      throw error;
    }
  };

  // Handle form changes
  const handleFormChange = () => {
    console.log('📝 Form changed, marking as unsaved');
    setHasUnsavedChanges(true);
  };

  // Warn on navigation if unsaved changes
  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

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
        Edit Order:{" "}
        <span className="text-brand-orange">{initialOrder.orderNumber}</span>
      </h1>

      <OrderForm
        onSave={handleSave}
        initialData={initialOrder}
        isSaving={updateOrderMutation.isPending}
        showFinancials={canEditAll}
        onFormChange={handleFormChange}
      />

      {/* Activity Log Section */}
      <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl p-10">
        <h3 className="text-lg font-semibold text-white mb-6">Activity Log</h3>
        
        {/* ✅ Debug Info */}
        <div className="text-xs text-slate-500 mb-4">
          Last Updated: {new Date().toLocaleTimeString()}
          {' | '}
          Total Changes: {activityLog?.length || 0}
        </div>

        <div className="space-y-3">
          {activityLog?.map((entry: any) => (
            <div 
              key={entry.id} 
              className="flex items-start gap-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700/50"
            >
              <div className="flex-1">
                <p className="text-sm font-medium text-white">
                  Field Updated: {entry.field_changed}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Changed from <span className="text-red-400">"{entry.old_value}"</span>
                  {' to '}
                  <span className="text-green-400">"{entry.new_value}"</span>
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  By {entry.user_email} • {new Date(entry.changed_at).toLocaleString()}
                </p>
              </div>
            </div>
          ))}

          {(!activityLog || activityLog.length === 0) && (
            <p className="text-sm text-slate-400">No activity yet</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default EditOrderPage;
