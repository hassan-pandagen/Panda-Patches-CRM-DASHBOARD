// src/pages/OrderPage.tsx - FINAL WITH APPROVAL WORKFLOW

import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { Order, UserRole, OrderStatus } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast'; // Check your path
import InvoiceModal from '../components/invoices/InvoiceModal';

// UI Components
import Spinner from '../components/ui/Spinner';
import Button from '../components/ui/Button';
import GlassCard from '../components/ui/GlassCard';
import StatusBadge from '../components/ui/StatusBadge';

// Icons
import { Edit, Trash2, ShieldAlert, ArrowLeft, Lock, MapPin, Smartphone, Maximize, Check, XCircle, AlertTriangle, Copy, FileText } from 'lucide-react';

// --- CONFIRMATION MODAL ---
const ConfirmationModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  orderNumber: string;
}> = ({ isOpen, onClose, onConfirm, orderNumber }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <div className="flex items-center gap-4 mb-4">
          <div className="p-3 bg-red-500/10 rounded-full">
            <ShieldAlert className="w-6 h-6 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-white">Confirm Deletion</h2>
        </div>
        <p className="text-slate-300 mb-6">
          This will permanently delete Order <strong>{orderNumber}</strong>. This action cannot be undone.
        </p>
        <div className="flex justify-end gap-4">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm}>Delete Permanently</Button>
        </div>
      </div>
    </div>
  );
};

const OrderPage: React.FC = () => {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const { user, role, permissions } = useAuth(); 
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const { toast } = useToast(); // <--- INITIALIZE TOAST
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // --- PERMISSION CHECKS ---
  const isAdmin = role === UserRole.ADMIN;
  const canViewFinancials = isAdmin || permissions?.view_financials;
  const canViewShipping = isAdmin || permissions?.view_shipping;
  const canViewProduction = isAdmin || permissions?.view_production;
  const canDelete = isAdmin || permissions?.can_delete_orders;

  // --- DATA FETCHING ---
  const { data: order, isLoading, error } = useQuery<Order | null, Error>({
    queryKey: ['order', orderNumber],
    queryFn: async () => {
      if (!orderNumber) throw new Error("No order number provided.");
      const { data, error } = await supabase
        .from('orders_with_details')
        .select('*')
        .eq('order_number', orderNumber) 
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!orderNumber,
  });

  // --- APPROVAL MUTATIONS ---
  const updateUrgentStatus = useMutation({
    mutationFn: async ({ isApproved, isUrgent }: { isApproved: boolean; isUrgent: boolean }) => {
        setIsProcessing(true);
        // 1. Update the Order
        const { error } = await supabase
            .from('orders')
            .update({ 
                is_urgent: isUrgent,
                is_urgent_approved: isApproved 
            })
            .eq('id', order?.id);
        
        if (error) throw error;

        // 2. Add Audit Log
        await supabase.from('order_history').insert({
            order_id: order?.id,
            user_email: user?.email || 'unknown',
            field_changed: 'URGENT_STATUS',
            old_value: `Urgent: ${order?.isUrgent}, Approved: ${order?.isUrgentApproved}`,
            new_value: `Urgent: ${isUrgent}, Approved: ${isApproved}`
        });
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['order', orderNumber] });
        queryClient.invalidateQueries({ queryKey: ['orders', 'urgent'] }); // Refresh notifications
        // REPLACED ALERT WITH TOAST
        toast.success('Urgent status updated successfully', 'The order priority has been changed.');
        setIsProcessing(false);
    },
    onError: (err) => {
        setIsProcessing(false);
        // REPLACED ALERT WITH TOAST
        toast.error('Update Failed', err.message);
    }
  });

  // --- DELETE MUTATION ---
  const deleteMutation = useMutation({
    mutationFn: async (orderToDelete: Order) => {
      await supabase.from('order_history').insert({
          order_id: orderToDelete.id,
          user_email: user?.email || 'unknown',
          field_changed: 'ORDER_DELETED',
          new_value: `Deleted by ${user?.email}`,
        });
      const { error } = await supabase.from('orders').delete().eq('id', orderToDelete.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allOrders'] });
      navigate('/orders');
      // REPLACED ALERT WITH TOAST
      toast.success('Order Deleted', `Order ${order?.orderNumber} has been permanently removed.`);
    },
    onError: (err) => {
       // REPLACED ALERT WITH TOAST
       toast.error('Delete Failed', err.message);
    }
  });

  if (isLoading) return <div className="flex h-screen items-center justify-center"><Spinner /></div>;
  if (error || !order) return <div className="text-center py-10 text-red-400">Error loading order.</div>;

  return (
    <>
      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={() => deleteMutation.mutate(order)}
        orderNumber={order.orderNumber}
      />

      <InvoiceModal 
        isOpen={isInvoiceModalOpen} 
        onClose={() => setIsInvoiceModalOpen(false)} 
        order={order}
      />

      <div className="space-y-6 pb-10">
        {/* --- HEADER & APPROVAL SECTION --- */}
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <Link to="/orders" className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors mb-2">
                    <ArrowLeft size={16} /> Back to All Orders
                    </Link>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        Order {order.orderNumber}
                        {order.isUrgent && (
                            <span className={`text-sm px-3 py-1 rounded-full border font-bold ${
                                order.isUrgentApproved 
                                ? 'bg-red-600/20 border-red-500 text-red-400' 
                                : 'bg-yellow-500/20 border-yellow-500 text-yellow-400 animate-pulse'
                            }`}>
                                {order.isUrgentApproved ? 'URGENT' : 'URGENT (APPROVAL NEEDED)'}
                            </span>
                        )}
                    </h1>
                </div>
                <div className="flex items-center gap-3">
            
                    {/* --- NEW: DUPLICATE BUTTON --- */}
                    <Button 
                      variant="secondary" 
                      size="md"
                      onClick={() => navigate('/new-order', { state: { duplicateOrder: order } })}
                      className="bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20 hover:border-blue-500/30"
                    >
                      <Copy size={16} />
                      <span className="hidden sm:inline">Repeat Order</span>
                    </Button>
                    <Button 
                      variant="secondary" 
                      size="md"
                      onClick={() => setIsInvoiceModalOpen(true)}
                      className="bg-purple-500/10 text-purple-400 border-purple-500/20 hover:bg-purple-500/20"
                    >
                      <FileText size={16} />
                      <span className="hidden sm:inline">Invoice</span>
                    </Button>
                    {/* ----------------------------- */}

                    {(isAdmin || user?.email === order.salesAgent) && (
                    <Link to={`/order/${order.orderNumber}/edit`}>
                        <Button variant="secondary" size="md"><Edit size={16} /> Edit Order</Button>
                    </Link>
                    )}
                </div>
            </div>

            {/* --- URGENT APPROVAL BANNER (ADMIN ONLY) --- */}
            {isAdmin && order.isUrgent && !order.isUrgentApproved && (
                <div className="bg-slate-800 border-l-4 border-yellow-500 rounded-r-xl p-4 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-yellow-500/10 rounded-lg text-yellow-500 mt-1 sm:mt-0">
                            <AlertTriangle className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="font-bold text-white text-lg">Urgent Approval Required</h3>
                            <p className="text-slate-400 text-sm">
                                The customer or agent has requested urgent production. This usually incurs a rush fee.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <button 
                            disabled={isProcessing}
                            onClick={() => updateUrgentStatus.mutate({ isApproved: false, isUrgent: false })}
                            className="flex-1 sm:flex-none px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors font-medium text-sm"
                        >
                            Reject Request
                        </button>
                        <button 
                            disabled={isProcessing}
                            onClick={() => updateUrgentStatus.mutate({ isApproved: true, isUrgent: true })}
                            className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-900/20"
                        >
                            <Check className="w-4 h-4" />
                            Approve Urgent
                        </button>
                    </div>
                </div>
            )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* --- LEFT COLUMN --- */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* CUSTOMER INFO (Secured) */}
            <GlassCard>
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    Customer Information
                </h3>
                {!canViewShipping && <Lock className="w-4 h-4 text-slate-500" />}
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase mb-1">Customer Name</p>
                  <p className="font-medium text-white text-base">{order.customerName}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase mb-1">Email Address</p>
                  <p className="font-medium text-white break-all">
                    {canViewShipping ? order.customerEmail : '•••••••• (Hidden)'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase mb-1 flex items-center gap-1">
                    <Smartphone className="w-3 h-3" /> Phone / Mobile
                  </p>
                  <p className="font-medium text-white">
                    {canViewShipping ? (order.customerPhone || 'N/A') : '•••••••• (Hidden)'}
                  </p>
                </div>
                <div>
                   <p className="text-xs font-medium text-slate-400 uppercase mb-1 flex items-center gap-1">
                     <MapPin className="w-3 h-3" /> Shipping Address
                   </p>
                   <p className="font-medium text-white text-sm leading-relaxed">
                     {canViewShipping ? (order.shippingAddress || 'No address provided') : '•••••••• (Hidden)'}
                   </p>
                </div>
              </div>
            </GlassCard>

            {/* DESIGN & PRODUCTION INFO */}
            {canViewProduction ? (
              <GlassCard>
                <h3 className="text-lg font-semibold text-white mb-6">Design & Production</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div>
                      <p className="text-xs font-medium text-slate-400 uppercase mb-1">Design Name</p>
                      <p className="font-medium text-white text-base">{order.designName || 'N/A'}</p>
                  </div>
                  <div>
                      <p className="text-xs font-medium text-slate-400 uppercase mb-1">Patch Type</p>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-brand-orange"></span>
                        <p className="font-medium text-white">{order.patchesType || 'Custom'}</p>
                      </div>
                  </div>
                  <div>
                      <p className="text-xs font-medium text-slate-400 uppercase mb-1">Quantity</p>
                      <p className="font-bold text-white text-xl">{order.patchesQuantity?.toLocaleString() || '0'} <span className="text-sm font-normal text-slate-400">pcs</span></p>
                  </div>
                  <div>
                      <p className="text-xs font-medium text-slate-400 uppercase mb-1 flex items-center gap-1">
                          <Maximize className="w-3 h-3" /> Size
                      </p>
                      <p className="font-medium text-white">{order.designSize || 'N/A'}</p>
                  </div>
                  <div>
                      <p className="text-xs font-medium text-slate-400 uppercase mb-1">Backing</p>
                      <p className="font-medium text-white">{order.designBacking || 'N/A'}</p>
                  </div>
                </div>
                
                {/* File Downloads would go here */}
                
              </GlassCard>
            ) : (
              <div className="p-8 rounded-xl border border-slate-700/50 bg-slate-800/20 flex flex-col items-center justify-center gap-3 text-slate-500 text-center">
                <Lock className="w-8 h-8 opacity-50" />
                <span className="font-medium">Production details are restricted for your role.</span>
              </div>
            )}
          </div>

          {/* --- RIGHT COLUMN --- */}
          <div className="lg:col-span-1 space-y-6">
            <GlassCard>
              <h3 className="text-lg font-semibold text-white mb-4">Summary</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center"><p className="text-slate-400 text-sm">Status</p><StatusBadge status={order.status as OrderStatus}/></div>
                <div className="flex justify-between items-center"><p className="text-slate-400 text-sm">Created Date</p><p className="font-medium text-white">{new Date(order.createdAt).toLocaleDateString()}</p></div>
                <div className="flex justify-between items-center"><p className="text-slate-400 text-sm">Sales Agent</p><p className="font-medium text-white">{order.salesAgent}</p></div>
                <div className="flex justify-between items-center"><p className="text-slate-400 text-sm">Lead Source</p><p className="font-medium text-white">{order.leadSource || 'N/A'}</p></div>
              </div>
            </GlassCard>

            {/* FINANCIALS (Secured) */}
            {canViewFinancials ? (
              <GlassCard>
                <h3 className="text-lg font-semibold text-white mb-4">Financials</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-1">
                      <p className="text-slate-300">Total Amount</p>
                      <p className="font-bold text-white text-lg">${order.orderAmount.toLocaleString()}</p>
                  </div>
                  <div className="w-full bg-slate-700 h-px my-1"></div>
                  
                  <div className="flex justify-between items-center">
                      <p className="text-slate-400 text-sm">Amount Paid</p>
                      <p className="font-medium text-green-400">${order.amountPaid.toLocaleString()}</p>
                  </div>
                  <div className="flex justify-between items-center">
                      <p className="text-slate-400 text-sm">Remaining</p>
                      <p className="font-medium text-yellow-400">${order.amountRemaining.toLocaleString()}</p>
                  </div>
                  
                  {/* Detailed Breakdown (Admin Only) */}
                  {isAdmin && (
                    <div className="bg-slate-900/50 rounded-lg p-3 mt-4 space-y-2 border border-white/5">
                      <p className="text-xs font-bold text-slate-500 uppercase mb-2">Internal Costs</p>
                      <div className="flex justify-between items-center"><p className="text-xs text-slate-400">Production</p><p className="text-xs font-medium text-white">-${order.productionCost.toLocaleString()}</p></div>
                      <div className="flex justify-between items-center"><p className="text-xs text-slate-400">Shipping</p><p className="text-xs font-medium text-white">-${order.shippingCost.toLocaleString()}</p></div>
                      <div className="flex justify-between items-center"><p className="text-xs text-slate-400">Marketing</p><p className="text-xs font-medium text-white">-${order.marketingCost.toLocaleString()}</p></div>
                      <div className="border-t border-white/10 pt-2 mt-1 flex justify-between items-center">
                          <p className="text-sm text-slate-300">Net Profit</p>
                          <p className={`text-sm font-bold ${order.profit >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>
                              ${order.profit.toLocaleString()}
                          </p>
                      </div>
                    </div>
                  )}
                </div>
              </GlassCard>
            ) : (
               // Empty state for non-financial users is handled by simply NOT rendering the card.
               // Or you can render a locked state if you prefer:
              <div className="p-6 rounded-xl border border-slate-700/50 bg-slate-800/20 flex items-center justify-center gap-3 text-slate-500">
                <Lock className="w-5 h-5" />
                <span>Financials restricted</span>
              </div>
            )}

            {/* DELETE BUTTON */}
            {canDelete && (
              <div className="pt-2">
                <Button variant="danger" size="sm" onClick={() => setIsDeleteModalOpen(true)} className="w-full bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 border border-red-500/20">
                  <Trash2 size={14} />
                  <span>Permanently Delete Order</span>
                </Button>
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
};

export default OrderPage;