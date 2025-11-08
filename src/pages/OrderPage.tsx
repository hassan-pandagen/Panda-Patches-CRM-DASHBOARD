
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getOrder, updateOrder, triggerNotificationWorkflow, deleteOrder, getOrderHistory } from '../services/orderService';
import { useQueryClient } from '@tanstack/react-query';
import { Order, OrderStatus, OrderHistoryEntry } from '../types/index'; // Corrected path
import { getStatusInfo, N8N_APPROVAL_WEBHOOK_URL } from '../constants'; // Corrected path
import Spinner from '../components/ui/Spinner';
import { useAuth } from '../contexts/AuthContext';
import OrderHistory from '../components/orders/OrderHistory';
import ConfirmationModal from '../components/ui/ConfirmationModal';
import { supabase } from '../services/supabaseClient';

const DetailItem: React.FC<{ label: string; value?: string | number }> = ({ label, value }) => {
    if (!value && value !== 0) return null;
    return <p><strong className="font-semibold text-slate-400">{label}:</strong> {value}</p>;
};

const NotesSection: React.FC<{ title: string, notes?: string}> = ({ title, notes }) => {
    if(!notes) return null;
    return (
        <div className="transition-all duration-200 ease-in-out">
            <h4 className="font-bold text-md mb-2 text-slate-100">{title}</h4>
            <p className="text-slate-300 whitespace-pre-wrap bg-[#0A0A0F]/70 p-3 rounded-lg border border-[#252836]">{notes}</p>
        </div>
    );
};

const AttachmentSection: React.FC<{ title: string; attachments?: string[] }> = ({ title, attachments }) => {
    if (!attachments || attachments.length === 0) return null;
    return (
        <div className="transition-all duration-200 ease-in-out">
            <h4 className="font-bold text-md mb-2 text-slate-100">{title}</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {attachments.map((url, index) => (
                    <a key={index} href={url} target="_blank" rel="noopener noreferrer" className="relative group">
                        <img 
                            src={url} 
                            alt={`Attachment ${index + 1}`} 
                            className="rounded-lg object-cover h-24 w-full ring-2 ring-transparent group-hover:ring-[#6366F1] transition-all duration-200" 
                        />
                    </a>
                ))}
            </div>
        </div>
    );
};

const ApprovalLinkGenerator: React.FC<{ orderNumber: string }> = ({ orderNumber }) => {
    const [copied, setCopied] = useState<boolean>(false);
    const baseURL = N8N_APPROVAL_WEBHOOK_URL.split('?')[0];
    const approveUrl = `${baseURL}?action=approve&orderNumber=${orderNumber}`;

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
        });
    };

    if (N8N_APPROVAL_WEBHOOK_URL === 'YOUR_N8N_APPROVAL_WEBHOOK_URL_HERE') {
        return (
            <div className="bg-[#F59E0B]/10 border-l-4 border-[#F59E0B] text-yellow-200 p-4" role="alert">
                <p className="font-bold">Configuration Needed</p>
                <p>Please set the `N8N_APPROVAL_WEBHOOK_URL` in `constants.ts` to enable customer approval links.</p>
            </div>
        );
    }

    return (
        <div className="bg-[#1A1B23] border border-[#252836] rounded-2xl p-6 space-y-4">
            <h3 className="text-xl font-semibold tracking-wide text-slate-100 mb-2">Customer Approval Link</h3>
            <p className="text-sm text-slate-300">
                This is the approval link to include in your n8n email template. It can also be copied from here if you need to resend it to the customer manually.
            </p>
            
            <div className="space-y-3">
                <div>
                    <label className="block text-slate-200 font-medium tracking-wide mb-2 text-sm">Approve Mockup Link</label>
                    <div className="mt-1 flex rounded-md shadow-sm">
                        <input type="text" readOnly value={approveUrl} className="flex-1 w-full bg-slate-800 border border-slate-700 rounded-l-lg px-3 py-2 text-white placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-copy" />
                        <button type="button" onClick={() => handleCopy(approveUrl)} className="relative -ml-px inline-flex items-center justify-center font-medium rounded-r-xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[#6366F1]/40 bg-[#252836] hover:bg-slate-700 text-slate-300 border border-[#252836] px-4 py-2">
                           <span>{copied ? 'Copied!' : 'Copy'}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};


const OrderPage: React.FC = () => {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const queryClient = useQueryClient();
  const [history, setHistory] = useState<OrderHistoryEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | undefined>();
  const [updateMessage, setUpdateMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [isReturningCustomer, setIsReturningCustomer] = useState<boolean>(false);

  const fetchOrderData = useCallback(async () => {
    if (!orderNumber) return;
    setLoading(true);
    setError(null);
    try {
      const fetchedOrder = await getOrder(orderNumber);
      if (fetchedOrder) {
        setOrder(fetchedOrder);
        setSelectedStatus(fetchedOrder.status);

        // --- RETURNING CUSTOMER LOGIC ---
        // After fetching the order, check if the customer has more than one order.
        if (fetchedOrder.customerEmail) {
          const { count, error: countError } = await supabase
            .from('orders')
            .select('id', { count: 'exact', head: true }) // `head: true` is efficient, just gets the count
            .eq('customer_email', fetchedOrder.customerEmail);

          if (countError) {
            console.warn("Could not check for returning customer:", countError.message);
          } else if (count && count > 1) {
            setIsReturningCustomer(true);
          }
        }

        // --- FIX: Gracefully handle missing history table ---
        // After getting the order, try to fetch its history.
        try {
            const fetchedHistory = await getOrderHistory(fetchedOrder.id);
            setHistory(fetchedHistory);
        } catch (historyError: any) {
            // If fetching history fails, log a warning but don't crash the page.
            console.warn("Could not fetch order history.", historyError.message);
            setHistory([]);
        }

      } else {
        setError(`Order #${orderNumber} could not be found.`);
      }
    } catch (e: any) {
      const errorMessage = e.message || 'An unknown error occurred.';
      console.error(`Failed to fetch order #${orderNumber}:`, errorMessage);
      setError(`Failed to load order: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [orderNumber, setHistory, role]);

  useEffect(() => {
    fetchOrderData();
  }, [fetchOrderData]);

  const handleStatusChange = async () => {
    if (!order || !selectedStatus || order.status === selectedStatus) return;
    setIsUpdating(true);
    setUpdateMessage(null);
    setDeleteError(null);
    try {
      // --- Optimistic UI Update ---
      // Create a new history entry locally before calling the database.
      const newHistoryEntry: OrderHistoryEntry = {
        id: Date.now(), // Temporary ID for React key
        order_id: order.id,
        user_email: user?.email || 'System',
        field_changed: 'status',
        old_value: order.status,
        new_value: selectedStatus,
        changed_at: new Date().toISOString(),
      };
      // Add it to the top of the current history state.
      setHistory([newHistoryEntry, ...history]);

      const updatedOrderData = { ...order, status: selectedStatus };
      const updatedOrder = await updateOrder(updatedOrderData);
      setOrder(updatedOrder);
      
      queryClient.invalidateQueries({ queryKey: ['order', orderNumber] }); // Invalidate to ensure fresh data
      await triggerNotificationWorkflow(updatedOrder);

      setUpdateMessage({ type: 'success', text: 'Status updated and notification sent!' });

    } catch (error: any) {
      console.error(error);
       if (error.message.includes('Webhook URL not configured')) {
            setUpdateMessage({ type: 'error', text: 'Order updated, but n8n webhook is not configured.' });
       } else {
            setUpdateMessage({ type: 'error', text: `Order status saved, but notification failed: ${error.message}` });
       }
    } finally {
      setIsUpdating(false);
      setTimeout(() => setUpdateMessage(null), 5000);
    }
  };

  const handleConfirmDelete = async () => {
    if (!order || !order.id) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteOrder(order.id);
      setIsDeleteModalOpen(false);
      navigate('/');
    } catch (error: any) {
      console.error("Failed to delete order:", error);
      setDeleteError(error.message || 'An unknown error occurred while deleting the order.');
      setIsDeleteModalOpen(false); // Close modal on error to show banner
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMarkPaymentComplete = async () => {
    if (!order) return;
    setIsUpdating(true);
    setUpdateMessage(null);
    try {
      const updatedOrder = await updateOrder({
        ...order,
        amountPaid: order.orderAmount, // Set amount paid to the total
        status: OrderStatus.COMPLETED, // Set status to Completed
        // Note: The backend trigger for order history will log this status change.
      });
      setOrder(updatedOrder); // Refresh the UI with the updated order
      setUpdateMessage({ type: 'success', text: 'Payment marked as complete!' });
    } catch (error: any) {
      setUpdateMessage({ type: 'error', text: `Error updating payment: ${error.message}` });
    } finally {
      setIsUpdating(false);
      setTimeout(() => setUpdateMessage(null), 5000);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><Spinner /></div>;
  }

  if (error) {
    return (
      <div className="text-center py-10 px-6 bg-[#EF4444]/10 text-red-300 rounded-lg shadow-md border border-[#EF4444]/20">
        <h3 className="text-xl font-semibold text-slate-100">Could not load order</h3>
        <p className="mt-2 text-sm max-w-2xl mx-auto">{error}</p>
        <div className="flex items-center justify-center gap-4 mt-6">
            <button onClick={fetchOrderData} className="px-4 py-2 rounded-lg bg-[#6366F1] text-white font-medium hover:bg-indigo-500 focus:ring-2 focus:ring-[#6366F1]/50 shadow-[0_0_15px_rgba(99,102,241,0.2)] transition-all duration-300 ease-in-out">
                Try Again
            </button>
             <Link to="/" className="px-4 py-2 rounded-lg bg-[#252836] border border-[#252836] text-slate-300 hover:text-[#6366F1] hover:border-[#6366F1]/50 transition-all duration-300">
                Back to Dashboard
            </Link>
        </div>
      </div>
    );
  }

  if (!order) {
    return <p className="text-center text-slate-400">Order not found.</p>;
  }
  
  const statusInfo = getStatusInfo(order.status);

  return (
    <div className="max-w-7xl mx-auto">
       <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Order"
        message={`Are you sure you want to permanently delete Order #${order.orderNumber}? This action cannot be undone.`}
        confirmButtonText="Delete"
        isConfirming={isDeleting}
      />

      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
        <div className="flex items-center gap-4">
            <h2 className="text-3xl font-semibold tracking-wide text-slate-100 flex items-center gap-3">
              Order #{order.orderNumber}
              {order.is_urgent && (
                <span className="text-xs font-bold uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded-full">Urgent</span>
              )}
            </h2>
            <span className={`px-4 py-2 text-sm font-semibold text-white rounded-full ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
        </div>
        <div className="flex items-center gap-2">
            <Link to={`/order/${order.orderNumber}/edit`} className="px-4 py-2 rounded-lg bg-[#252836] border border-[#252836] text-slate-300 hover:text-[#6366F1] hover:border-[#6366F1]/50 transition-all duration-300">
                Edit Order
            </Link>
            {/* --- PROTECTED ACTION --- */}
            {/* The delete button is now only visible to ADMIN users. */}
            {role === 'ADMIN' && (
                <button 
                    onClick={() => setIsDeleteModalOpen(true)}
                    className="px-4 py-2 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/20 text-red-300 hover:bg-[#EF4444]/20 hover:border-[#EF4444]/40 transition-all duration-300"
                >
                    Delete Order
                </button>
            )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Order Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* URGENT APPROVAL BLOCK */}
          {role === 'ADMIN' && order.is_urgent && !order.is_urgent_approved && ( // Only ADMIN
            <div className="bg-amber-500/10 border-l-4 border-amber-500 text-amber-200 p-4 flex items-center justify-between gap-4 rounded-r-lg">
              <div>
                <p className="font-bold">Urgent Request Pending</p>
                <p className="text-sm">This order has been marked as urgent by the sales agent and requires your approval.</p>
              </div>

              <div className="flex gap-2 flex-shrink-0">
                {isUpdating ? (
                  <div className="flex items-center justify-center px-3 py-1 rounded-md bg-slate-700 text-slate-300 text-sm font-semibold">
                    <Spinner small /> Updating...
                  </div>
                ) : (
                  <>
                    <button
                      onClick={async () => {
                        setIsUpdating(true);
                        try {
                          // ✅ Update database (approve urgent)
                          const { error } = await supabase
                            .from("orders")
                            .update({ is_urgent_approved: true, is_urgent: true })
                            .eq("order_number", order.orderNumber);

                          if (error) throw error;

                          // ✅ Update local state immediately
                          // This optimistic update will be confirmed/overwritten by the query invalidation
                          setOrder({ ...order, is_urgent_approved: true, is_urgent: true });

                          // ✅ Send realtime update manually (optional but ensures bell clears fast)
                          supabase.channel('orders').send({
                            type: 'broadcast',
                            event: 'urgent_approval',
                            payload: { orderNumber: order.orderNumber, approved: true },
                          });
                          queryClient.invalidateQueries({ queryKey: ['order', orderNumber] }); // Invalidate to ensure fresh data

                          setUpdateMessage({ type: 'success', text: 'Urgent order approved!' });
                        } catch (err: any) {
                          setUpdateMessage({ type: 'error', text: err.message || 'Failed to approve order.' });
                        } finally {
                          setIsUpdating(false);
                          setTimeout(() => setUpdateMessage(null), 4000);
                        }
                      }}
                      className="px-3 py-1 rounded-md bg-green-600/80 text-white text-sm font-semibold hover:bg-green-500"
                    >
                      Approve
                    </button>

                    <button
                      onClick={async () => {
                        setIsUpdating(true);
                        try {
                          // ✅ Update database (deny urgent)
                          const { error } = await supabase
                            .from("orders")
                            .update({ is_urgent_approved: false, is_urgent: false })
                            .eq("order_number", order.orderNumber);

                          if (error) throw error;

                          // This optimistic update will be confirmed/overwritten by the query invalidation
                          setOrder({ ...order, is_urgent_approved: false, is_urgent: false });

                          supabase.channel('orders').send({
                            type: 'broadcast',
                            event: 'urgent_denied',
                            payload: { orderNumber: order.orderNumber, approved: false },
                          });
                          queryClient.invalidateQueries({ queryKey: ['order', orderNumber] }); // Invalidate to ensure fresh data

                          setUpdateMessage({ type: 'success', text: 'Urgent order denied.' });
                        } catch (err: any) {
                          setUpdateMessage({ type: 'error', text: err.message || 'Failed to deny order.' });
                        } finally {
                          setIsUpdating(false);
                          setTimeout(() => setUpdateMessage(null), 4000);
                        }
                      }}
                      className="px-3 py-1 rounded-md bg-red-600/80 text-white text-sm font-semibold hover:bg-red-500"
                    >
                      Deny
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {order.status === OrderStatus.AWAITING_CUSTOMER_APPROVAL && <ApprovalLinkGenerator orderNumber={order.orderNumber} />}
          <div className="bg-[#1A1B23] border border-[#252836] rounded-2xl p-6 space-y-4">
            <h3 className="text-xl font-semibold tracking-wide text-slate-100 mb-2">Design & Product</h3>
            <div className="space-y-4">
                <DetailItem label="Design Name" value={order.designName} />
                <DetailItem label="Quantity" value={order.patchesQuantity} />
                <DetailItem label="Type" value={order.patchesType} />
                <DetailItem label="Size" value={order.designSize} />
                <DetailItem label="Backing" value={order.designBacking} />
                <NotesSection title="Instructions" notes={order.instructions} />
                <AttachmentSection title="Customer Attachments" attachments={order.customerAttachmentURLs} />
                <AttachmentSection title="Mockup Attachments" attachments={order.mockupURLs} />
            </div>
          </div>
          <div className="bg-[#1A1B23] border border-[#252836] rounded-2xl p-6 space-y-4">
            <h3 className="text-xl font-semibold tracking-wide text-slate-100 mb-2">Revisions & Redos</h3>
            <NotesSection title="Revision Notes" notes={order.revisionNotes} />
            <NotesSection title="Redo Notes" notes={order.redoNotes} />
            <AttachmentSection title="Redo Attachments" attachments={order.redoAttachments} />
          </div>
          <div className="bg-[#1A1B23] border border-[#252836] rounded-2xl p-6 space-y-2">
            <h3 className="text-xl font-semibold tracking-wide text-slate-100 mb-2">Customer Information</h3>
            <div className="flex items-center gap-3">
              <DetailItem label="Name" value={order.customerName} />
              {isReturningCustomer && (
                <span className="text-xs font-bold uppercase tracking-wider bg-green-500/20 text-green-300 border border-green-500/30 px-2 py-1 rounded-full">Returning Customer</span>
              )}
            </div>
            <DetailItem label="Email" value={order.customerEmail} />
            <DetailItem label="Phone" value={order.customerPhone} />
            <DetailItem label="Shipping Address" value={order.shippingAddress} />
          </div> 
           {(role === 'ADMIN' || role === 'AGENT' ) && (
            <div className="bg-[#1A1B23] border border-[#252836] rounded-2xl p-6 space-y-2">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-semibold tracking-wide text-slate-100">Financials</h3>
                  {order.amountRemaining > 0 && (
                    <button
                      onClick={handleMarkPaymentComplete}
                      disabled={isUpdating}
                      className="px-3 py-1 text-sm rounded-lg bg-green-600/80 border border-green-500/60 text-white font-medium hover:bg-green-500/90 focus:ring-2 focus:ring-green-500/50 shadow-[0_0_10px_rgba(34,197,94,0.3)] transition-all duration-300 ease-in-out disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Mark Payment Complete
                    </button>
                  )}
                </div>
                <DetailItem label="Total Amount" value={`$${order.orderAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                <DetailItem label="Amount Paid" value={`$${order.amountPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                <p><strong className="font-semibold text-slate-400">Amount Remaining:</strong> <span className="font-bold text-[#6366F1]">${order.amountRemaining.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
            </div>
           )}
           <div className="bg-[#1A1B23] border border-[#252836] rounded-2xl p-6 space-y-4">
                <h3 className="text-xl font-semibold tracking-wide text-slate-100">Shipping Details</h3>
                
                <div className="border border-slate-700 rounded-lg p-4 space-y-2 bg-slate-900/30">
                  <DetailItem label="Order Number" value={`#${order.orderNumber}`} />
                  <DetailItem label="Customer Name" value={order.customerName} />
                  <DetailItem label="Phone Number" value={order.customerPhone} />
                  <DetailItem label="Address" value={order.shippingAddress} />
                  <hr className="border-slate-700 my-2" />
                  <DetailItem label="Patch Type" value={order.patchesType} />
                  <DetailItem label="Quantity" value={order.patchesQuantity} />
                </div>
                <div className="space-y-2 pt-2">
                  <DetailItem label="Courier" value={order.courier} />
                  <DetailItem label="Tracking Number" value={order.trackingNumber} />
                </div>
           </div>
        </div>

        {/* Right Column: Status Update & History */}
        <div className="lg:col-span-1 space-y-6">
            <div className="sticky top-8">
              <div className="bg-[#1A1B23] border border-[#252836] rounded-2xl p-6">
                  <h3 className="text-xl font-semibold tracking-wide text-slate-100 mb-4">Update Status & Notify</h3>
                  <div className="space-y-4">
                      <div>
                          <label htmlFor="status" className="block text-sm font-medium text-slate-400 mb-2">New Status</label>
                          <select
                          id="status"
                          name="status"
                          value={selectedStatus}
                          onChange={(e) => setSelectedStatus(e.target.value as OrderStatus)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 appearance-none"
                          >
                          {Object.values(OrderStatus).map((status) => (
                              <option key={status} value={status}>
                                  {getStatusInfo(status).label}
                              </option>
                          ))}
                          </select>
                      </div>
                      <button
                          onClick={handleStatusChange}
                          disabled={isUpdating || order.status === selectedStatus}
                          className="w-full flex justify-center px-4 py-2 rounded-lg bg-[#6366F1] text-white font-medium hover:bg-indigo-500 focus:ring-2 focus:ring-[#6366F1]/50 shadow-[0_0_15px_rgba(99,102,241,0.2)] transition-all duration-300 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                          {isUpdating ? <Spinner small /> : 'Update & Send Notification'}
                      </button>
                  </div>
              </div>

                {/* --- NOTIFICATION TOAST --- */}
                {/* This is the banner that shows success/error messages. It's now a "toast" notification. */}
                {(updateMessage || deleteError) && (
                    <div className={`fixed bottom-8 right-8 z-50 max-w-sm rounded-lg shadow-lg border ${
                        (updateMessage?.type === 'success') ? 'bg-green-500/10 border-green-500/30 text-green-300' : 'bg-red-500/10 border-red-500/30 text-red-300'
                    }`}>
                        <div className="p-4">
                            <div className="flex items-start">
                                <div className="ml-3 w-0 flex-1 pt-0.5">
                                    <p className="text-sm font-medium text-slate-100">
                                        {updateMessage?.text || deleteError}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <OrderHistory history={history} />
        </div>
      </div>
    </div>
  );
};

export default OrderPage;
