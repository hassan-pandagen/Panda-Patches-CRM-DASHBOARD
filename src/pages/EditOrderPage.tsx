import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getOrder, updateOrder } from '../services/orderService';
import { Order } from '../types/index';
import OrderForm, { SaveData } from '../components/orders/OrderForm';
import Spinner from '../components/ui/Spinner';
import { useWarnIfUnsaved } from '../components/layout/useWarnIfUnsaved';
import UnsavedChangesModal from '../components/ui/UnsavedChangesModal';

const EditOrderPage: React.FC = () => {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const { showModal, confirmLeave, cancelLeave } = useWarnIfUnsaved(isDirty);

  const fetchOrder = useCallback(async () => {
    if (!orderNumber) {
      navigate('/');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const fetchedOrder = await getOrder(orderNumber);
      if (fetchedOrder) {
        setOrder(fetchedOrder);
      } else {
        setError(`The order #${orderNumber} you are trying to edit does not exist.`);
      }
    } catch (e: any) {
      const errorMessage = e.message || 'An unknown error occurred.';
      console.error(`Failed to fetch order #${orderNumber} for editing:`, errorMessage);
      setError(`Could not load order for editing: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [orderNumber, navigate]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  const handleSave = async (formData: SaveData) => {
    if (!order) return;
    setIsSaving(true);
    setError(null);
    setIsDirty(false); // Mark as not dirty before saving
    try {
      const updatedOrderData: Order = {
        ...order,
        ...formData,
        id: order.id,
      };
      const savedOrder = await updateOrder(updatedOrderData);
      navigate(`/order/${savedOrder.orderNumber}`);
    } catch (err: any) {
      console.error('Failed to update order', err);
      setError(`Failed to save order: ${err.message || 'An unknown error occurred.'}`);
      setIsDirty(true); // Set back to dirty if save fails
    } finally {
      setIsSaving(false);
    }
  };
  
  const initialData = useMemo(() => {
    if (!order) {
      return {};
    }
    const { orderNumber: _, createdAt: __, status: ___, amountRemaining: ____, ...data } = order;
    return data;
  }, [order]);

  const onFormChange = useCallback(() => {
    if (!isDirty) {
      setIsDirty(true);
    }
  }, [isDirty]);

  if (loading) {
    return <div className="flex justify-center items-center h-64"><Spinner /></div>;
  }
  
  if (error && !order) {
    return (
      <div className="text-center py-10 px-6 bg-red-900/30 text-red-200 rounded-lg shadow-md">
        <h3 className="text-xl font-semibold">Could not load order</h3>
        <p className="mt-2 text-sm max-w-2xl mx-auto">{error}</p>
        <div className="flex items-center justify-center gap-4 mt-6">
          <button 
            onClick={fetchOrder} 
            className="inline-flex items-center justify-center font-medium rounded-xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[#BC13FE]/40 bg-[#BC13FE] hover:bg-purple-600 text-white shadow-[0_0_10px_rgba(188,19,254,0.3)] hover:shadow-[0_0_20px_rgba(188,19,254,0.5)] px-4 py-2"
          >
            Try Again
          </button>
          <Link 
            to="/" 
            className="inline-flex items-center justify-center font-medium rounded-xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[#BC13FE]/40 bg-slate-800 hover:bg-slate-700 text-gray-300 border border-slate-700/50 px-4 py-2"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!order) {
    return <p className="text-center">Order not found.</p>;
  }

  return (
    <div>
      <h2 className="text-3xl font-bold text-gray-100 mb-6">Edit Order #{order.orderNumber}</h2>

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
        <OrderForm 
          onSave={handleSave} 
          initialData={initialData} 
          isSaving={isSaving} 
          onFormChange={onFormChange} 
        />
      </div>
    </div>
  );
};

export default EditOrderPage;