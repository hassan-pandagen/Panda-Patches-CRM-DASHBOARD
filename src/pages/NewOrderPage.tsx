// src/pages/NewOrderPage.tsx - FINAL REDESIGNED VERSION

import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { createOrder } from '../services/orderService';
import { Order } from '../types/index';
import OrderForm from '../components/orders/OrderForm';
import { useWarnIfUnsaved } from "../hooks";
import UnsavedChangesModal from "../components/ui/UnsavedChangesModal";
import { useAuth } from '../contexts/AuthContext';

type CreateOrderData = Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'updatedAt' | 'status' | 'amountRemaining' | 'created_by' | 'profit'> & { profit?: number }; 

const NewOrderPage: React.FC = () => {
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showModal, confirmLeave, cancelLeave } = useWarnIfUnsaved(isDirty);
  const { user } = useAuth();

  const handleSave = async (formData: CreateOrderData) => {
    // --- FIX: Calculate profit before saving ---
    const productionCost = Number(formData.productionCost) || 0;
    const shippingCost = Number(formData.shippingCost) || 0;
    const marketingCost = Number(formData.marketingCost) || 0;
    const orderAmount = Number(formData.orderAmount) || 0;
    const profit = orderAmount - (productionCost + shippingCost + marketingCost);

    setIsSaving(true);
    setError(null);
    setIsDirty(false);
    try {
      // Add the calculated profit to the data being sent
      formData.profit = profit;
      const newOrder = await createOrder(formData, user?.email || 'unknown');
      // Invalidate queries to refetch data on other pages
      await queryClient.invalidateQueries({ queryKey: ['allOrders'] });
      await queryClient.invalidateQueries({ queryKey: ['allOrdersReport'] });
      navigate(`/order/${newOrder.orderNumber}`);
    } catch (err: any) {
      console.error('Failed to create order', err);
      setError(`Failed to create order: ${err.message || 'An unknown error occurred.'}`);
      setIsDirty(true);
    } finally {
      setIsSaving(false);
    }
  };

  const onFormChange = useCallback(() => {
    if (!isDirty) setIsDirty(true);
  }, [isDirty]);

  return (
    <div className="p-6">
      <h2 className="text-3xl font-bold text-gray-100 mb-6">Create New Order</h2>
      
      <UnsavedChangesModal 
        show={showModal}
        onConfirm={confirmLeave}
        onCancel={cancelLeave}
      />
      
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border-l-4 border-red-500 text-red-300" role="alert">
          <h3 className="font-bold">An Error Occurred</h3>
          <p>{error}</p>
        </div>
      )}
      
      {/* --- THIS IS THE MAIN CHANGE --- */}
      <OrderForm onSave={handleSave} isSaving={isSaving} onFormChange={onFormChange} />
    </div>
  );
};

export default NewOrderPage;