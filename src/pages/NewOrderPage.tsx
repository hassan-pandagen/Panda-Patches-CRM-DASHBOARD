import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createOrder } from '../services/orderService';
import { Order } from '../types/index';
import OrderForm from '../components/orders/OrderForm';
import { useWarnIfUnsaved } from "../hooks";
import UnsavedChangesModal from "../components/ui/UnsavedChangesModal";

// This is the type of data the form will provide, which matches what createOrder expects.
type CreateOrderData = Omit<
  Order,
  'id' | 'orderNumber' | 'createdAt' | 'updatedAt' | 'status' | 'amountRemaining' | 'created_by'
>; 

const NewOrderPage: React.FC = () => {
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const navigate = useNavigate();
  const { showModal, confirmLeave, cancelLeave } = useWarnIfUnsaved(isDirty);

  const handleSave = async (formData: CreateOrderData) => {
    setIsSaving(true);
    setError(null);
    setIsDirty(false); // Mark as not dirty before saving
    try {
      const newOrder = await createOrder(formData);
      navigate(`/order/${newOrder.orderNumber}`);
    } catch (err: any) {
      console.error('Failed to create order', err);
      setError(`Failed to create order: ${err.message || 'An unknown error occurred.'}`);
      setIsDirty(true); // Set back to dirty if save fails
    } finally {
      setIsSaving(false);
    }
  };

  const onFormChange = useCallback(() => {
    if (!isDirty) setIsDirty(true);
  }, [isDirty]);

  return (
    <div>
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
      
      <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 lg:p-8">
        <OrderForm onSave={handleSave} isSaving={isSaving} onFormChange={onFormChange} />
      </div>
    </div>
  );
};

export default NewOrderPage;