// src/pages/OrderPage.tsx - FINAL WITH APPROVAL WORKFLOW + INLINE PRODUCTION EDITING

import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { Order, UserRole, OrderStatus } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { queryKeys } from '../constants/queryKeys';
import InvoiceModal from '../components/invoices/InvoiceModal';
import { mapDbToOrder, triggerStatusEmail, sendPaymentConfirmationEmail } from '../services/orderService';
import FileUploadSection from '../components/orders/FileUpload';

// UI Components
import Spinner from '../components/ui/Spinner';
import Button from '../components/ui/Button';
import SpotlightCard from '../components/ui/SpotlightCard';
import StatusBadge from '../components/ui/StatusBadge';

// Icons (Check already imported below)
import { Edit, Trash2, ShieldAlert, ArrowLeft, Lock, MapPin, Smartphone, Maximize, Check, XCircle, AlertTriangle, Copy, FileText, Upload, Package, X, Mail } from 'lucide-react';

// 1. Import the new component
import OrderTimeline from '../components/orders/OrderTimeline';
import ShippingLabelModal from '../components/orders/ShippingLabelModal';
import OptimizedImage from '../components/ui/OptimizedImage';
import AssignOrderSection from '../components/orders/AssignOrderSection';
import EmailLogsSection from '../components/orders/EmailLogsSection';

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
    const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
    const { success: showSuccess, error: showError } = useToast();
    const [isInvoiceModalOpen, setIsInvoiceModalOpen] = React.useState(false);
    const [isShippingLabelModalOpen, setIsShippingLabelModalOpen] = React.useState(false);
    const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
    const [isProcessing, setIsProcessing] = React.useState(false);
    const [productionFiles, setProductionFiles] = React.useState<string[]>([]);
    const [isEditingProduction, setIsEditingProduction] = React.useState(false);
    const [isSendingPaymentEmail, setIsSendingPaymentEmail] = React.useState(false);

    // --- PERMISSION CHECKS ---
    const isAdmin = role === UserRole.ADMIN;

    // A user can view financials if they are admin, or have either the report or edit financial permission.
    const canViewFinancials =
        isAdmin ||
        permissions?.reports_view_financials === true ||
        permissions?.orders_edit_financials === true;

    // Check for the correct 'shipping_view' key.
    const canViewShipping = isAdmin || permissions?.shipping_view === true;
    // Check for the correct 'orders_edit_production' key.
    const canViewProduction = isAdmin || permissions?.orders_edit_production === true;
    // Check for the correct 'orders_delete' key.
    const canDelete = isAdmin || permissions?.orders_delete === true;

    // A user can edit if they are admin, or have permission to edit production, financials, or change status.
    const canEdit =
        isAdmin ||
        permissions?.orders_edit_production ||
        permissions?.orders_edit_financials ||
        permissions?.orders_change_status;

    // --- DATA FETCHING ---
    const { data: order, isLoading, error } = useQuery<Order | null, Error>({
        queryKey: queryKeys.orders.single(orderNumber),
        queryFn: async () => {
            if (!orderNumber) throw new Error("No order number provided.");

            // 1. Query the TABLE (snake_case source)
            const { data, error } = await supabase
                .from('orders')
                .select('*')
                .eq('order_number', orderNumber) // 2. Filter using SNAKE_CASE
                .single();

            if (error) throw error;

            // 3. Map immediately (Convert to Frontend Language)
            return mapDbToOrder(data);
        },
        enabled: !!orderNumber,
    });

    // Populate production files when order loads
    React.useEffect(() => {
        if (order?.productionFileUrls) {
            setProductionFiles(order.productionFileUrls);
        }
    }, [order?.id]);

    // Auto-save production files when they change
    React.useEffect(() => {
        if (isEditingProduction && order && productionFiles.length > 0) {
            // Only auto-save if files have actually changed from the order
            const hasChanged = JSON.stringify(productionFiles) !== JSON.stringify(order.productionFileUrls || []);
            if (hasChanged) {
                const timer = setTimeout(() => {
                    updateProductionFilesMutation.mutate(productionFiles);
                }, 2000); // 2 second debounce
                return () => clearTimeout(timer);
            }
        }
    }, [productionFiles, isEditingProduction, order]);

    // --- PRODUCTION FILE UPDATE MUTATION ---
    const updateProductionFilesMutation = useMutation({
        mutationFn: async (files: string[]) => {
            const { error } = await supabase
                .from('orders')
                .update({ production_file_urls: files })
                .eq('id', order?.id);

            if (error) throw error;

            // Add audit log
            await supabase.from('order_history').insert({
                order_id: order?.id,
                user_email: user?.email || 'unknown',
                field_changed: 'production_file_urls',
                old_value: 'Files updated',
                new_value: 'Files updated'
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.orders.single(orderNumber) });
            queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all() });
            toast.success('Production Files Saved', 'Files have been updated successfully.');
            setIsEditingProduction(false);
        },
        onError: (err) => {
            toast.error('Save Failed', err.message);
        }
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
            queryClient.invalidateQueries({ queryKey: queryKeys.orders.single(orderNumber) });
            queryClient.invalidateQueries({ queryKey: queryKeys.orders.urgent() });
            queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all() });
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
            queryClient.invalidateQueries({ queryKey: queryKeys.orders.all() });
            queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all() });
            navigate('/orders');
            toast.success('Order Deleted', `Order ${order?.orderNumber} has been permanently removed.`);
        },
        onError: (err) => {
            // REPLACED ALERT WITH TOAST
            toast.error('Delete Failed', err.message);
        }
    });

    // --- RESEND EMAIL MUTATION ---
    const resendEmailMutation = useMutation({
        mutationFn: async ({ order, status }: { order: Order; status: string }) => {
            console.log(`📧 Manually resending email for order ${order.orderNumber} with status ${status}`);
            await triggerStatusEmail(order, status);
        },
        onSuccess: () => {
            toast.success('Email Sent', 'The order confirmation email has been resent to the customer.');
        },
        onError: (err: any) => {
            console.error('❌ Email resend failed:', err);
            toast.error('Email Failed', err.message || 'Failed to send email. Check console for details.');
        }
    });

    if (isLoading) return <Spinner fullScreen message="Loading order details..." />;
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

            <ShippingLabelModal
                isOpen={isShippingLabelModalOpen}
                onClose={() => setIsShippingLabelModalOpen(false)}
                order={order}
            />

            {/* Image Preview Modal */}
            {previewUrl && (
                <div
                    className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                    onClick={() => setPreviewUrl(null)}
                >
                    <div
                        className="bg-slate-900 rounded-lg border border-white/10 max-w-4xl max-h-[85vh] overflow-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-4 border-b border-white/10 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-white">
                                Image Preview
                            </h3>
                            <button
                                onClick={() => setPreviewUrl(null)}
                                className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-4 flex items-center justify-center">
                            <OptimizedImage
                                src={previewUrl}
                                alt="Image Preview"
                                className="max-w-full max-h-[70vh] rounded"
                            />
                        </div>
                    </div>
                </div>
            )}

            <div className="p-6 max-w-7xl mx-auto space-y-6">
                {/* --- HEADER & APPROVAL SECTION --- */}
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors mb-2">
                                <ArrowLeft size={16} /> Back to All Orders
                            </button>
                            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                                Order {order.orderNumber}
                                {order.isUrgent && (
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`text-sm px-3 py-1 rounded-full border font-bold ${order.isUrgentApproved
                                            ? 'bg-red-600/20 border-red-500 text-red-400'
                                            : 'bg-yellow-500/20 border-yellow-500 text-yellow-400 animate-pulse'
                                            }`}>
                                            {order.isUrgentApproved ? 'URGENT' : 'URGENT (APPROVAL NEEDED)'}
                                        </span>
                                        {order.rushDate && (
                                            <span className="text-sm px-3 py-1 rounded-full border font-bold bg-orange-500/20 border-orange-500 text-orange-400">
                                                🚢 Ship by: {new Date(order.rushDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </span>
                                        )}
                                    </div>
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

                            {/* --- SHIPPING LABEL BUTTON --- */}
                            <Button
                                variant="secondary"
                                size="md"
                                onClick={() => setIsShippingLabelModalOpen(true)}
                                className="bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20 hover:border-green-500/30"
                            >
                                <Package size={16} />
                                <span className="hidden sm:inline">Shipping Label</span>
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

                            {/* ✅ FIXED: Show Edit for Admin or users with financials/status perms (not production-only) */}
                            {canEdit && (isAdmin || permissions?.orders_edit_financials || permissions?.orders_change_status) && (
                                <Link to={`/order/${order.orderNumber}/edit`}>
                                    <Button variant="secondary" size="md"><Edit size={16} /> Edit Order</Button>
                                </Link>
                            )}

                            {/* ✅ NEW: Production Edit toggle for production users */}
                            {canViewProduction && !isAdmin && (
                                <Button
                                    variant={isEditingProduction ? "primary" : "secondary"}
                                    size="md"
                                    onClick={() => setIsEditingProduction(!isEditingProduction)}
                                >
                                    <Upload size={16} /> {isEditingProduction ? 'Done Editing' : 'Edit Production'}
                                </Button>
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
                                    {order.rushDate && (
                                        <p className="mt-2 text-sm font-bold text-orange-400">
                                            🚢 Must ship by: {new Date(order.rushDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                                        </p>
                                    )}
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

                        {/* CUSTOMER INFO - Only show to non-production users or admins */}
                        {!(canViewProduction && !isAdmin) && (
                            <SpotlightCard className="p-6">
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
                            </SpotlightCard>
                        )}

                        {/* DESIGN & PRODUCTION INFO */}
                        {canViewProduction ? (
                            <SpotlightCard className="p-6">
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

                                {/* Special Instructions for Production */}
                                {order.instructions && (
                                    <div className="mt-6 pt-6 border-t border-slate-700/50">
                                        <p className="text-xs font-medium text-slate-400 uppercase mb-2">Special Instructions</p>
                                        <p className="text-white text-sm leading-relaxed bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">{order.instructions}</p>
                                    </div>
                                )}

                                {/* Mockup Images Section */}
                                {(order.mockupUrls?.length || 0) > 0 && (
                                    <div className="mt-6 pt-6 border-t border-slate-700/50">
                                        <p className="text-xs font-medium text-slate-400 uppercase mb-4">Mockups / Proofs</p>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                            {order.mockupUrls?.map((url, idx) => (
                                                <button
                                                    key={`mockup-${idx}`}
                                                    onClick={() => setPreviewUrl(url)}
                                                    className="relative group overflow-hidden rounded-lg border border-slate-600 hover:border-brand-orange transition-all cursor-pointer"
                                                >
                                                    <img
                                                        src={url}
                                                        alt={`Mockup ${idx + 1}`}
                                                        className="w-full h-32 object-cover group-hover:scale-110 transition-transform duration-300"
                                                        onError={(e) => {
                                                            (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22%23334155%22 viewBox=%220 0 24 24%22%3E%3Cpath d=%22M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5.04-6.71l-2.75-3.54L6 17h12l-3.96-5.29z%22/%3E%3C/svg%3E';
                                                        }}
                                                    />
                                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Customer Reference Images Section */}
                                {(order.customerAttachmentUrls?.length || 0) > 0 && (
                                    <div className="mt-6 pt-6 border-t border-slate-700/50">
                                        <p className="text-xs font-medium text-slate-400 uppercase mb-4">Customer References</p>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                            {order.customerAttachmentUrls?.map((url, idx) => (
                                                <button
                                                    key={`customer-${idx}`}
                                                    onClick={() => setPreviewUrl(url)}
                                                    className="relative group overflow-hidden rounded-lg border border-slate-600 hover:border-brand-orange transition-all cursor-pointer"
                                                >
                                                    <img
                                                        src={url}
                                                        alt={`Customer Reference ${idx + 1}`}
                                                        className="w-full h-32 object-cover group-hover:scale-110 transition-transform duration-300"
                                                        onError={(e) => {
                                                            (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22%23334155%22 viewBox=%220 0 24 24%22%3E%3Cpath d=%22M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5.04-6.71l-2.75-3.54L6 17h12l-3.96-5.29z%22/%3E%3C/svg%3E';
                                                        }}
                                                    />
                                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Production Files - Inline Editing for Production Users */}
                                {isEditingProduction && !isAdmin && (
                                    <div className="mt-6 pt-6 border-t border-slate-700/50">
                                        <div className="flex items-center justify-between mb-4">
                                            <p className="text-xs font-medium text-slate-400 uppercase">Production Files</p>
                                            {updateProductionFilesMutation.isPending && (
                                                <span className="text-xs text-blue-400 flex items-center gap-1">
                                                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                                                    Saving...
                                                </span>
                                            )}
                                            {!updateProductionFilesMutation.isPending && productionFiles !== order.productionFileUrls && (
                                                <span className="text-xs text-green-400 flex items-center gap-1">
                                                    <Check size={12} />
                                                    Saved
                                                </span>
                                            )}
                                        </div>
                                        <FileUploadSection
                                            title=""
                                            bucketName="production-files"
                                            folderPath={`orders/${order.id}`}
                                            urls={productionFiles}
                                            onUrlsChange={setProductionFiles}
                                        />
                                        <div className="mt-4 flex justify-end gap-3">
                                            <Button
                                                variant="secondary"
                                                onClick={() => {
                                                    setProductionFiles(order.productionFileUrls || []);
                                                    setIsEditingProduction(false);
                                                }}
                                            >
                                                Done
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {/* Display files when not editing */}
                                {!isEditingProduction && productionFiles.length > 0 && (
                                    <div className="mt-6 pt-6 border-t border-slate-700/50">
                                        <p className="text-xs font-medium text-slate-400 uppercase mb-3">Production Files</p>
                                        <div className="space-y-2">
                                            {productionFiles.map((url, idx) => (
                                                <a
                                                    key={idx}
                                                    href={url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-400 hover:text-blue-300 text-sm truncate flex items-center gap-2"
                                                >
                                                    <FileText size={14} />
                                                    {decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'File').replace(/^(mockup_)?\d{10,}_/, '').replace(/^[a-f0-9-]{36}\./, '')}
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}

                            </SpotlightCard>
                        ) : (
                            <div className="p-8 rounded-xl border border-slate-700/50 bg-slate-800/20 flex flex-col items-center justify-center gap-3 text-slate-500 text-center">
                                <Lock className="w-8 h-8 opacity-50" />
                                <span className="font-medium">Production details are restricted for your role.</span>
                            </div>
                        )}
                    </div>

                    {/* --- RIGHT COLUMN --- */}
                    <div className="lg:col-span-1 space-y-6">
                        <SpotlightCard className="p-6">
                            <h3 className="text-lg font-semibold text-white mb-4">Summary</h3>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center"><p className="text-slate-400 text-sm">Status</p><StatusBadge status={order.status as OrderStatus} /></div>
                                <div className="flex justify-between items-center"><p className="text-slate-400 text-sm">Created Date</p><p className="font-medium text-white">{new Date(order.createdAt).toLocaleDateString()}</p></div>
                                <div className="flex justify-between items-center"><p className="text-slate-400 text-sm">Sales Agent</p><p className="font-medium text-white">{order.salesAgent}</p></div>
                                <div className="flex justify-between items-center"><p className="text-slate-400 text-sm">Lead Source</p><p className="font-medium text-white">{order.leadSource || 'N/A'}</p></div>
                            </div>
                        </SpotlightCard>

                        {/* ASSIGNMENT SECTION */}
                        <AssignOrderSection
                            orderId={order.id}
                            orderNumber={order.orderNumber}
                            currentAgent={order.salesAgent}
                            assignedBy={order.assignedBy}
                            assignedAt={order.assignedAt}
                            onAssignmentChange={() => refetch()}
                        />

                        {/* FINANCIALS (Secured) */}
                        {canViewFinancials ? (
                            <SpotlightCard className="p-6">
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
                            </SpotlightCard>
                        ) : (
                            // Empty state for non-financial users is handled by simply NOT rendering the card.
                            // Or you can render a locked state if you prefer:
                            <div className="p-6 rounded-xl border border-slate-700/50 bg-slate-800/20 flex items-center justify-center gap-3 text-slate-500">
                                <Lock className="w-5 h-5" />
                                <span>Financials restricted</span>
                            </div>
                        )}

                        {/* PAYMENT CONFIRMATION EMAIL */}
                        {isAdmin && order && (
                            <div className="pt-2">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    disabled={isSendingPaymentEmail}
                                    onClick={async () => {
                                        setIsSendingPaymentEmail(true);
                                        try {
                                            await sendPaymentConfirmationEmail(order);
                                            showSuccess('Payment confirmation email sent!');
                                        } catch (err: any) {
                                            showError('Email failed', err?.message);
                                        } finally {
                                            setIsSendingPaymentEmail(false);
                                        }
                                    }}
                                    className="w-full"
                                >
                                    <Mail size={14} />
                                    <span>{isSendingPaymentEmail ? 'Sending…' : 'Send Payment Confirmation'}</span>
                                </Button>
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

                {/* ✅ EMAIL LOGS (Full Width) */}
                {order && (
                    <div className="w-full animate-fadeIn lg:col-span-3">
                        <EmailLogsSection order={order} />
                    </div>
                )}

                {/* ✅ ACTIVITY TIMELINE (Full Width at Bottom) */}
                <div className="w-full animate-fadeIn lg:col-span-3">
                    {/* Pass the numeric ID (e.g., 123) not the string "PP-10021"
              Ensure 'order.id' is the DB Primary Key */}
                    {order && <OrderTimeline orderId={order.id} />}
                </div>
            </div>
        </>
    );
};

export default OrderPage;