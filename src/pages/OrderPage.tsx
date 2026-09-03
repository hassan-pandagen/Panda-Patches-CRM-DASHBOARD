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
import { mapDbToOrder, triggerStatusEmail, sendPaymentConfirmationEmail, updateOrderDetails, triggerProductionCompleteEmail } from '../services/orderService';
import { getPremiumStatus, setPremiumStatus } from '../services/customerFlagsService';
import { getCustomerByEmail } from '../services/customersService';
import { isWebCheckoutAgent, leadSourceDisplay } from '../utils/leadSource';
import { roleCan, ROLES_CAN_VIEW_CUSTOMER_IDENTITY, ROLES_CAN_CONFIRM_COLOUR_MATCH } from '../utils/roleAccess';
import FileUploadSection from '../components/orders/FileUpload';

// UI Components
import Spinner from '../components/ui/Spinner';
import Button from '../components/ui/Button';
import SpotlightCard from '../components/ui/SpotlightCard';
import StatusBadge from '../components/ui/StatusBadge';
import PremiumBadge from '../components/ui/PremiumBadge';
import MaskedAmount from '../components/ui/MaskedAmount';

// Attachment grids render <img> for images; a PDF there used to fall through to the
// onError placeholder and then to an image lightbox that could never display it. Same
// test as src/components/orders/FileUpload.tsx.
const isImageUrl = (url: string) => /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url);
const attachmentFileName = (url: string) => {
  try { return decodeURIComponent(url.split('/').pop() || 'file').split('?')[0]; }
  catch { return 'file'; }
};

// Icons (Check already imported below)
import { Edit, Trash2, ShieldAlert, ArrowLeft, Lock, MapPin, Smartphone, Maximize, Check, XCircle, AlertTriangle, Copy, FileText, Upload, Package, X, Mail, DollarSign, Crown, RotateCcw, Palette } from 'lucide-react';

// 1. Import the new component
import OrderTimeline from '../components/orders/OrderTimeline';
import ShippingLabelModal from '../components/orders/ShippingLabelModal';
import ShipByPill from '../components/orders/ShipByPill';
import AssignOrderSection from '../components/orders/AssignOrderSection';
import EmailLogsSection from '../components/orders/EmailLogsSection';
import OrderNotesSection from '../components/orders/OrderNotesSection';
import OrderMessageThread from '../components/messaging/OrderMessageThread';
import AttributionQualityBadge, { getAttributionQualityFromOrder } from '../components/AttributionQualityBadge';
import MarkAsPaidModal from '../components/orders/MarkAsPaidModal';
import CorrectPaymentModal from '../components/orders/CorrectPaymentModal';
import MetaCapiPanel from '../components/orders/MetaCapiPanel';
import GeneratePaymentLinkModal from '../components/orders/GeneratePaymentLinkModal';

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
    const [isMarkPaidModalOpen, setIsMarkPaidModalOpen] = React.useState(false);
    const [isCorrectPaymentOpen, setIsCorrectPaymentOpen] = React.useState(false);
    const [isGenerateLinkModalOpen, setIsGenerateLinkModalOpen] = React.useState(false);
    // Production/digitizer mockup-upload → Send for Approval flow
    const [mockupFiles, setMockupFiles] = React.useState<string[]>([]);
    // Production-completion "packet" photos + modal
    const [isCompleteModalOpen, setIsCompleteModalOpen] = React.useState(false);
    const [completionPhotos, setCompletionPhotos] = React.useState<string[]>([]);
    const MAX_COMPLETION_PHOTOS = 5;

    // --- PERMISSION CHECKS ---
    const isAdmin = role === UserRole.ADMIN;

    // A user can view financials if they are admin, or have either the report or edit financial permission.
    const canViewFinancials =
        isAdmin ||
        permissions?.reports_view_financials === true ||
        permissions?.orders_edit_financials === true;

    // Editing what's actually paid (record + correct) requires the financial-edit permission.
    const canEditFinancials = isAdmin || permissions?.orders_edit_financials === true;

    // Check for the correct 'shipping_view' key.
    const canViewShipping = isAdmin || permissions?.shipping_view === true;
    // Check for the correct 'orders_edit_production' key.
    const canViewProduction = isAdmin || permissions?.orders_edit_production === true;
    const isShipping = role === UserRole.SHIPPING; // shipper: sees the order read-only + can change status
    // Who the customer is — separate from shipping_view, which both Production accounts hold.
    const canViewCustomerIdentity = roleCan(role, ROLES_CAN_VIEW_CUSTOMER_IDENTITY);
    const canConfirmColourMatch = roleCan(role, ROLES_CAN_CONFIRM_COLOUR_MATCH);
    // Check for the correct 'orders_delete' key.
    const canDelete = isAdmin || permissions?.orders_delete === true;

    // A user can edit if they are admin, or have permission to edit production, financials, or change status.
    const canEdit =
        isAdmin ||
        permissions?.orders_edit_production ||
        permissions?.orders_edit_financials ||
        permissions?.orders_change_status;

    // --- DATA FETCHING ---
    const { data: order, isLoading, error, refetch } = useQuery<Order | null, Error>({
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

    // --- PREMIUM CUSTOMER FLAG ---
    const canTogglePremium = isAdmin || permissions?.orders_create === true;
    const { data: premiumFlag } = useQuery({
        queryKey: ['customer-premium', order?.customerEmail],
        queryFn: () => getPremiumStatus(order!.customerEmail),
        enabled: !!order?.customerEmail,
    });
    const togglePremiumMutation = useMutation({
        mutationFn: async (next: boolean) => {
            if (!order?.customerEmail) throw new Error('No customer email on this order');
            await setPremiumStatus(order.customerEmail, next, user?.email ?? 'unknown');
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['customer-premium', order?.customerEmail] });
            showSuccess(premiumFlag?.isPremium ? 'Premium flag removed' : 'Marked as Premium Customer');
        },
        onError: (err: any) => showError('Failed to update', err?.message || 'Could not update premium status.'),
    });

    // --- LINKED CUSTOMER ACCOUNT (cross-link to /portal-customers/:id, degrades silently pre-backfill) ---
    const { data: linkedCustomer } = useQuery({
        queryKey: ['customer-by-email', order?.customerEmail],
        queryFn: () => getCustomerByEmail(order!.customerEmail),
        enabled: !!order?.customerEmail,
    });

    // Populate production files when order loads
    React.useEffect(() => {
        if (order?.productionFileUrls) {
            setProductionFiles(order.productionFileUrls);
        }
    }, [order?.id]);

    // Seed the mockup uploader with any mockups already on the order
    React.useEffect(() => {
        setMockupFiles(order?.mockupUrls || []);
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

    // --- COLOUR MATCH (chenille letter packages) ---
    // The gate itself is the DB trigger guard_colour_match_before_production. This mutation
    // only records the supervisor's choice; if it never runs, production stays blocked, which
    // is the correct failure direction. Nothing here auto-proceeds.
    const [yarnDraft, setYarnDraft] = React.useState('');
    // Seed with the match if there is one, else the customer's own words — for a 'standard'
    // colour that makes confirming genuinely one click, which is what the brief asks for.
    React.useEffect(() => {
        setYarnDraft(order?.matchedYarn || order?.colourProposedYarn || order?.customerColourInput || '');
    }, [order?.id, order?.matchedYarn, order?.colourProposedYarn, order?.customerColourInput]);

    const confirmColourMatchMutation = useMutation({
        mutationFn: async (yarn: string) => {
            const trimmed = yarn.trim();
            if (!trimmed) throw new Error('Enter the yarn before confirming.');
            const { error } = await supabase
                .from('orders')
                .update({ matched_yarn: trimmed })
                .eq('id', order?.id);
            if (error) throw error;
            // trigger_log_order_changes already records the raw field change; this adds the
            // human sentence beside it, carrying the customer's original words for context.
            await supabase.from('order_history').insert({
                order_id: order?.id,
                user_email: user?.email || 'unknown',
                field_changed: 'matched_yarn',
                old_value: order?.matchedYarn || 'not set',
                new_value: trimmed + ' (customer asked for: ' + (order?.customerColourInput || 'no colour recorded') + ')',
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.orders.single(orderNumber) });
            showSuccess('Colour Match Confirmed', 'Production is no longer blocked on this order.');
        },
        onError: (err: any) => showError('Could not save', err?.message || 'Try again.'),
    });

    // Propose a closest match and ask the customer. Deliberately two writes, not one:
    // propose_colour_match records the proposal and mints the link token, then we send.
    // colour_email_sent_at is stamped ONLY after send-email returns ok, because that stamp
    // is what starts the 24h/48h chase clock — stamping an email that never left would
    // start a clock on a customer who was never asked.
    //
    // Nothing here touches matched_yarn. The gate stays shut until the customer answers.
    const proposeColourMatchMutation = useMutation({
        mutationFn: async (yarn: string) => {
            const trimmed = yarn.trim();
            if (!trimmed) throw new Error('Enter your closest match first.');

            const { data: token, error: rpcErr } = await supabase
                .rpc('propose_colour_match', { p_order_id: order?.id, p_yarn: trimmed });
            if (rpcErr) throw rpcErr;

            const confirmUrl = `${window.location.origin}/colour-match/${token}`;
            const { error: mailErr } = await supabase.functions.invoke('send-email', {
                body: {
                    to: order?.customerEmail,
                    template_id: 'CUSTOMER_COLOUR_MATCH_CONFIRM',
                    dynamic_data: {
                        order_number: order?.orderNumber,
                        customer_name: order?.customerName,
                        design_name: order?.designName,
                        quantity: order?.patchesQuantity,
                        customer_colour_input: order?.customerColourInput,
                        customer_colour_hex: order?.customerColourHex,
                        colour_proposed_yarn: trimmed,
                        portal_action_url: confirmUrl,
                        portal_login_url: confirmUrl,
                    },
                },
            });
            if (mailErr) throw new Error('Proposal saved, but the email did not send. Try Resend.');

            await supabase.from('orders')
                .update({ colour_email_sent_at: new Date().toISOString() })
                .eq('id', order?.id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.orders.single(orderNumber) });
            showSuccess('Sent to customer', 'Production stays blocked until they confirm.');
        },
        onError: (err: any) => showError('Could not send', err?.message || 'Try again.'),
    });

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
            showSuccess('Production Files Saved', 'Files have been updated successfully.');
            setIsEditingProduction(false);
        },
        onError: (err: any) => {
            showError('Save Failed', err.message);
        }
    });

    // --- PRODUCTION COMPLETION MUTATIONS ---
    const markProductionDoneMutation = useMutation({
        mutationFn: async (photos: string[]) => {
            if (!order?.id) throw new Error('No order loaded');
            const { error } = await supabase.rpc('mark_production_done', {
                p_order_id: order.id,
                p_completion_photos: photos,
            });
            if (error) throw error;
            // Fire the internal completion email to the production office (fire-and-forget:
            // a mail hiccup must not undo the completion). Money-free by design.
            triggerProductionCompleteEmail({ ...order, productionCompletedBy: user?.email ?? order.productionCompletedBy }, photos)
                .catch(err => console.error('Production-complete email failed (background):', err));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.orders.single(orderNumber) });
            queryClient.invalidateQueries({ queryKey: queryKeys.orders.all() });
            queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all() });
            setIsCompleteModalOpen(false);
            setCompletionPhotos([]);
            showSuccess('Marked Production Complete', 'Packet emailed to the production office.');
        },
        onError: (err: any) => {
            showError('Mark Failed', err?.message || 'Could not mark production done.');
        },
    });

    const unmarkProductionDoneMutation = useMutation({
        mutationFn: async () => {
            if (!order?.id) throw new Error('No order loaded');
            const { error } = await supabase.rpc('unmark_production_done', { p_order_id: order.id });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.orders.single(orderNumber) });
            queryClient.invalidateQueries({ queryKey: queryKeys.orders.all() });
            queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all() });
            showSuccess('Production Unmarked', 'Order is back in the production queue.');
        },
        onError: (err: any) => {
            showError('Unmark Failed', err?.message || 'Could not unmark production.');
        },
    });

    // --- DIGITIZER: UPLOAD MOCKUP → SEND FOR APPROVAL ---
    // Persists the mockup(s) AND moves the order to Awaiting Approval in one action.
    // updateOrderDetails fires the customer approval email automatically on this status change,
    // so production can send proofs to the customer directly — no agent middle-step.
    const sendForApprovalMutation = useMutation({
        mutationFn: async () => {
            if (!order?.id) throw new Error('No order loaded');
            if (mockupFiles.length === 0) throw new Error('Upload at least one mockup before sending for approval.');
            // Production users can't UPDATE orders directly — RLS (orders_update_policy) allows only
            // admins or the owning sales agent. Use the SECURITY DEFINER RPC scoped to exactly this
            // transition (mockup + NEW/REVISION → Awaiting Approval).
            const { error: rpcError } = await supabase.rpc('send_mockup_for_approval', {
                p_order_id: order.id,
                p_mockup_urls: mockupFiles,
            });
            if (rpcError) throw rpcError;
            // The RPC bypasses updateOrderDetails, so fire the customer approval email ourselves
            // (CUSTOMER_MOCKUP_READY, sent on AWAITING_APPROVAL). Fire-and-forget — a mail hiccup
            // must not undo the status change.
            const updatedOrder = { ...order, mockupUrls: mockupFiles, status: OrderStatus.AWAITING_APPROVAL };
            triggerStatusEmail(updatedOrder, OrderStatus.AWAITING_APPROVAL)
                .catch(err => console.error('Approval email failed (background):', err));
            return updatedOrder;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.orders.single(orderNumber) });
            queryClient.invalidateQueries({ queryKey: queryKeys.orders.all() });
            queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all() });
            showSuccess('Sent for Approval', 'Mockup saved, order set to Awaiting Approval, and the customer approval email was sent.');
        },
        onError: (err: any) => {
            showError('Could not send for approval', err?.message || 'Please try again.');
        },
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
            showSuccess('Urgent status updated successfully', 'The order priority has been changed.');
            setIsProcessing(false);
        },
        onError: (err: any) => {
            setIsProcessing(false);
            showError('Update Failed', err.message);
        }
    });

    // --- DELETE MUTATION ---
    const deleteMutation = useMutation({
        mutationFn: async (orderToDelete: Order) => {
            // Soft-delete via an admin-only SECURITY DEFINER RPC. It runs as the table owner, so it
            // bypasses an RLS WITH-CHECK interaction that blocked a direct client-side UPDATE of
            // deleted_at (admins hit "new row violates row-level security policy for table orders").
            // The function enforces is_admin(), writes the ORDER_DELETED history row, and sets
            // deleted_at atomically — the row + its history survive (no untraceable loss).
            const { error } = await supabase.rpc('admin_soft_delete_order', { p_order_id: orderToDelete.id });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.orders.all() });
            queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all() });
            navigate('/orders');
            showSuccess('Order Deleted', `Order ${order?.orderNumber} has been removed.`);
        },
        onError: (err: any) => {
            showError('Delete Failed', err.message);
        }
    });

    // --- RESEND EMAIL MUTATION ---
    const resendEmailMutation = useMutation({
        mutationFn: async ({ order, status }: { order: Order; status: string }) => {
            console.log(`📧 Manually resending email for order ${order.orderNumber} with status ${status}`);
            await triggerStatusEmail(order, status);
        },
        onSuccess: () => {
            showSuccess('Email Sent', 'The order confirmation email has been resent to the customer.');
        },
        onError: (err: any) => {
            console.error('❌ Email resend failed:', err);
            showError('Email Failed', err.message || 'Failed to send email. Check console for details.');
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

            {/* --- PRODUCTION COMPLETE: add packet photos + mark done --- */}
            {isCompleteModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center gap-4 mb-2">
                            <div className="p-3 bg-emerald-500/10 rounded-full">
                                <Check className="w-6 h-6 text-emerald-400" />
                            </div>
                            <h2 className="text-xl font-bold text-white">Mark Production Complete</h2>
                        </div>
                        <p className="text-slate-300 text-sm mb-5">
                            Order <strong>{order.orderNumber}</strong> will be removed from the production queue.
                            Add up to {MAX_COMPLETION_PHOTOS} photos of the finished
                            product (optional) — they'll be emailed to the production office as the completion packet.
                        </p>

                        <FileUploadSection
                            title=""
                            bucketName="production-files"
                            folderPath={`orders/${order.id}/completion`}
                            urls={completionPhotos}
                            onUrlsChange={(urls) => setCompletionPhotos(urls.slice(0, MAX_COMPLETION_PHOTOS))}
                        />
                        {completionPhotos.length >= MAX_COMPLETION_PHOTOS && (
                            <p className="text-xs text-amber-400 mt-2">
                                Maximum {MAX_COMPLETION_PHOTOS} photos reached.
                            </p>
                        )}

                        <div className="flex justify-end gap-3 mt-6">
                            <Button
                                variant="secondary"
                                onClick={() => { setIsCompleteModalOpen(false); setCompletionPhotos([]); }}
                                disabled={markProductionDoneMutation.isPending}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="primary"
                                onClick={() => markProductionDoneMutation.mutate(completionPhotos)}
                                disabled={markProductionDoneMutation.isPending}
                                className="bg-emerald-500/90 hover:bg-emerald-500 border-emerald-500"
                            >
                                <Check size={16} />
                                {markProductionDoneMutation.isPending
                                    ? 'Marking…'
                                    : completionPhotos.length > 0
                                        ? `Mark Complete & Send (${completionPhotos.length})`
                                        : 'Mark Complete Without Photos'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

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

            <MarkAsPaidModal
                isOpen={isMarkPaidModalOpen}
                onClose={() => setIsMarkPaidModalOpen(false)}
                orderId={order.id}
                orderNumber={order.orderNumber}
                orderAmount={order.orderAmount || 0}
                amountAlreadyPaid={order.amountPaid || 0}
            />

            <CorrectPaymentModal
                isOpen={isCorrectPaymentOpen}
                onClose={() => setIsCorrectPaymentOpen(false)}
                orderId={order.id}
                orderNumber={order.orderNumber}
                orderAmount={order.orderAmount || 0}
                amountAlreadyPaid={order.amountPaid || 0}
            />

            <GeneratePaymentLinkModal
                isOpen={isGenerateLinkModalOpen}
                onClose={() => setIsGenerateLinkModalOpen(false)}
                orderId={order.id}
                orderNumber={order.orderNumber}
                orderAmount={order.orderAmount || 0}
                amountAlreadyPaid={order.amountPaid || 0}
                customerName={order.customerName}
                customerEmail={order.customerEmail}
                customerPhone={order.customerPhone ?? null}
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
                            <img
                                src={previewUrl}
                                alt="Image Preview"
                                className="max-w-full max-h-[70vh] rounded"
                                onError={(e) => {
                                    const target = e.currentTarget;
                                    target.style.display = 'none';
                                    const parent = target.parentElement;
                                    if (parent && !parent.querySelector('.img-error-msg')) {
                                        // Built with DOM APIs (not innerHTML) so a hostile attachment
                                        // URL/filename can't inject markup — link.href uses the property
                                        // setter, which never parses HTML.
                                        const msg = document.createElement('div');
                                        msg.className = 'img-error-msg text-center text-slate-400 py-8 px-6';

                                        const icon = document.createElement('div');
                                        icon.className = 'text-4xl mb-3';
                                        icon.textContent = '🖼️';

                                        const title = document.createElement('div');
                                        title.className = 'text-sm font-medium text-slate-300 mb-1';
                                        title.textContent = 'Image not available';

                                        const hint = document.createElement('div');
                                        hint.className = 'text-xs text-slate-400';
                                        hint.textContent = 'The file may have failed to upload. Ask the customer to re-send the artwork.';

                                        const link = document.createElement('a');
                                        link.href = previewUrl;
                                        link.target = '_blank';
                                        link.rel = 'noopener noreferrer';
                                        link.className = 'mt-3 inline-block text-xs text-brand-orange underline';
                                        link.textContent = 'Try opening directly →';

                                        msg.append(icon, title, hint, link);
                                        parent.appendChild(msg);
                                    }
                                }}
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
                            <h1 className="text-3xl font-bold text-white flex items-center gap-3 flex-wrap">
                                Order {order.orderNumber}
                                {/* CL0FAA §3: pre-migration customer-facing number, so an agent can confirm a
                                    match when a customer quotes an old number from a prior email. */}
                                {order.legacyCustomerRef && (
                                    <span
                                        title="Legacy customer-facing reference (pre-migration)"
                                        className="text-xs font-normal px-2 py-1 rounded-full bg-slate-700/60 text-slate-300 border border-slate-600"
                                    >
                                        Legacy Ref: {order.legacyCustomerRef}
                                    </span>
                                )}
                                <AttributionQualityBadge quality={getAttributionQualityFromOrder(order)} />
                                {premiumFlag?.isPremium && <PremiumBadge size="md" />}
                                {/* Priority mockup — Silver/Gold customer (CL86F1 Task 3). No financial data; safe for production. */}
                                {order.priorityMockup && (
                                  <span title="Silver/Gold loyalty customer — prioritize the mockup" className="inline-flex items-center rounded-full border font-semibold text-xs px-2.5 py-1 bg-violet-400/15 border-violet-400/40 text-violet-300">
                                    ⚡ Priority
                                  </span>
                                )}

                                {/* Paid / Unpaid pill — for SHIPPING (and financial viewers); hidden from PRODUCTION (no payment info). */}
                                {(canViewFinancials || role === UserRole.SHIPPING) && (() => {
                                    const amt = order.orderAmount || 0;
                                    const paid = order.amountPaid || 0;
                                    const isPaid = amt > 0 && paid >= amt;
                                    const isPartial = paid > 0 && paid < amt;
                                    return (
                                        <span className={`text-xs px-3 py-1 rounded-full border font-semibold ${
                                            isPaid ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                            : isPartial ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                                            : 'bg-red-500/15 border-red-500/40 text-red-300'
                                        }`}>
                                            {isPaid ? '✓ Paid' : isPartial ? 'Partially Paid' : 'Unpaid'}
                                        </span>
                                    );
                                })()}

                                {/* Production Complete: action button (open) OR badge (already done) */}
                                {order.productionCompletedAt ? (
                                    <span
                                        className="text-xs px-3 py-1 rounded-full border font-semibold bg-emerald-500/15 border-emerald-500/40 text-emerald-300 flex items-center gap-1.5"
                                        title={`Marked by ${order.productionCompletedBy || 'unknown'} on ${new Date(order.productionCompletedAt).toLocaleString()}`}
                                    >
                                        <Check size={12} /> Production Complete
                                        <span className="text-emerald-400/70 font-normal">
                                            · {new Date(order.productionCompletedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </span>
                                        {isAdmin && (
                                            <button
                                                onClick={() => {
                                                    if (window.confirm('Unmark production complete? This order will return to the production queue.')) {
                                                        unmarkProductionDoneMutation.mutate();
                                                    }
                                                }}
                                                disabled={unmarkProductionDoneMutation.isPending}
                                                className="ml-1 text-emerald-400 hover:text-white transition-colors"
                                                title="Admin: unmark production"
                                            >
                                                <X size={12} />
                                            </button>
                                        )}
                                    </span>
                                ) : (canViewProduction || isAdmin) && (
                                    <button
                                        onClick={() => {
                                            setCompletionPhotos([]);
                                            setIsCompleteModalOpen(true);
                                        }}
                                        disabled={markProductionDoneMutation.isPending}
                                        className="text-xs px-3 py-1.5 rounded-full border font-semibold bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 hover:text-white transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                    >
                                        <Check size={12} />
                                        {markProductionDoneMutation.isPending ? 'Marking…' : 'Mark Production Complete'}
                                    </button>
                                )}

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
                                <ShipByPill shipByDate={order.shipByDate} status={order.status} className="ml-1 align-middle" />
                            </h1>
                        </div>
                        <div className="flex items-center gap-3">

                            {/* --- PREMIUM CUSTOMER TOGGLE --- */}
                            {canTogglePremium && (
                                <Button
                                    variant="secondary"
                                    size="md"
                                    disabled={togglePremiumMutation.isPending}
                                    onClick={() => togglePremiumMutation.mutate(!premiumFlag?.isPremium)}
                                    className={premiumFlag?.isPremium
                                        ? 'bg-amber-400/10 text-amber-300 border-amber-400/30 hover:bg-amber-400/20'
                                        : 'bg-slate-700/40 text-slate-300 border-slate-600 hover:bg-slate-700/60'}
                                    title={premiumFlag?.isPremium ? 'Remove Premium flag from this customer' : 'Mark this customer as Premium — production will apply extra QA/QC'}
                                >
                                    <Crown size={16} />
                                    <span className="hidden sm:inline">
                                        {togglePremiumMutation.isPending ? 'Saving…' : premiumFlag?.isPremium ? 'Premium ✓' : 'Mark Premium'}
                                    </span>
                                </Button>
                            )}

                            {/* --- NEW: DUPLICATE BUTTON --- */}
                            <Button
                                variant="secondary"
                                size="md"
                                onClick={() => navigate('/new-order', { state: { paymentFlow: true, duplicateOrder: order, isReorder: true } })}
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

                            {/* CL0FAA §2: auto PAID-invoice email sent — shown once, never re-sent */}
                            {order.paidInvoiceSentAt && (
                                <span
                                    title={`Paid invoice emailed to the customer on ${new Date(order.paidInvoiceSentAt).toLocaleString()}`}
                                    className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                >
                                    <FileText size={14} />
                                    Paid invoice sent ✓
                                </span>
                            )}

                            {/* ✅ FIXED: Show Edit for Admin or users with financials/status perms (not production-only) */}
                            {canEdit && (isAdmin || permissions?.orders_edit_financials || permissions?.orders_change_status) && (
                                <Link to={`/order/${order.orderNumber}/edit`}>
                                    <Button variant="secondary" size="md"><Edit size={16} /> Edit Order</Button>
                                </Link>
                            )}

                            {/* Production Edit toggle — Done Editing forces an immediate save.
                                Was `canViewProduction && !isAdmin`, which locked admins out of the inline
                                production flow entirely: they could not see production files on this page at
                                all, only upload them through Edit Order — which then wrote to a different,
                                public bucket. Both surfaces now write to production-files/orders/<id>
                                (brief rev 6, Task 0.2a). Admins get the same flow as production. */}
                            {canViewProduction && (
                                <Button
                                    variant={isEditingProduction ? "primary" : "secondary"}
                                    size="md"
                                    disabled={updateProductionFilesMutation.isPending}
                                    onClick={() => {
                                        if (isEditingProduction) {
                                            // Force-save pending changes before exiting edit mode
                                            const hasChanged = JSON.stringify(productionFiles) !== JSON.stringify(order.productionFileUrls || []);
                                            if (hasChanged) {
                                                updateProductionFilesMutation.mutate(productionFiles);
                                                // setIsEditingProduction(false) is already called inside mutation onSuccess
                                            } else {
                                                setIsEditingProduction(false);
                                            }
                                        } else {
                                            setIsEditingProduction(true);
                                        }
                                    }}
                                >
                                    <Upload size={16} /> {
                                        updateProductionFilesMutation.isPending
                                            ? 'Saving…'
                                            : isEditingProduction ? 'Done Editing' : 'Edit Production'
                                    }
                                </Button>
                            )}

                        </div>
                    </div>

                    {/* --- COLOUR MATCH GATE (chenille letter packages) --- */}
                    {/* Two branches, per the brief. 'standard' is one click and no email —
                        the colour is one we stock, so there is nothing to ask. 'needs-customer-
                        confirmation' cannot be closed by staff at all: only the customer's own
                        answer writes matched_yarn, via respond_to_colour_match. That is why the
                        supervisor gets a "Send to customer" button here and not a Confirm one. */}
                    {order.colourMatchRequired && (() => {
                        const yarn = String(order.matchedYarn || '').trim();
                        const isDone = !!yarn;
                        const needsCustomer = order.colourMatchStatus === 'needs-customer-confirmation';
                        const awaitingCustomer = needsCustomer && !isDone && !!order.colourEmailSentAt
                            && !order.colourCustomerResponse;
                        const declined = order.colourCustomerResponse === 'changes_requested';
                        return (
                            <div className={`bg-slate-800 border-l-4 rounded-r-xl p-4 shadow-lg ${
                                isDone ? 'border-emerald-500' : declined ? 'border-red-500' : 'border-fuchsia-500'
                            }`}>
                                <div className="flex items-start gap-3">
                                    <div className={`p-2 rounded-lg mt-1 sm:mt-0 ${
                                        isDone ? 'bg-emerald-500/10 text-emerald-400'
                                               : declined ? 'bg-red-500/10 text-red-400'
                                               : 'bg-fuchsia-500/10 text-fuchsia-400'
                                    }`}>
                                        <Palette className="w-6 h-6" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold text-white text-lg">
                                            {isDone ? 'Colour Match Confirmed'
                                                : declined ? 'Customer asked for a different colour'
                                                : awaitingCustomer ? 'Waiting on the customer'
                                                : 'Colour Match Required — production is blocked'}
                                        </h3>
                                        <p className="text-slate-400 text-sm">
                                            This set has no mockup cycle. The colour match is the only approval step
                                            before the yarn is cut.
                                        </p>

                                        <div className="mt-3 flex flex-wrap items-center gap-3">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs uppercase tracking-wider text-slate-400 font-bold">Customer typed</span>
                                                {order.customerColourHex && (
                                                    <span
                                                        className="w-6 h-6 rounded border border-white/20 shrink-0"
                                                        style={{ backgroundColor: order.customerColourHex }}
                                                        title={order.customerColourHex}
                                                    />
                                                )}
                                                <span className="font-mono text-base text-white bg-slate-900 px-2 py-1 rounded border border-white/10">
                                                    {order.customerColourInput || 'no colour recorded'}
                                                </span>
                                            </div>
                                            {needsCustomer && !isDone && (
                                                <span className="px-2 py-1 rounded text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                                    NEEDS CUSTOMER CONFIRMATION
                                                </span>
                                            )}
                                            {isDone && (
                                                <span className="text-sm text-slate-300">
                                                    Matched: <strong className="text-white">{yarn}</strong>
                                                    {order.colourCustomerRespondedAt && ' — approved by the customer'}
                                                </span>
                                            )}
                                        </div>

                                        {awaitingCustomer && (
                                            <p className="mt-3 text-sm text-slate-400">
                                                Proposed <strong className="text-white">{order.colourProposedYarn}</strong>,
                                                sent {new Date(order.colourEmailSentAt!).toLocaleString()}.
                                                {order.colourReminderSentAt && ' Reminder sent.'}
                                                {order.colourFollowupFlaggedAt && ' ⚠️ 48h passed — needs a phone call.'}
                                            </p>
                                        )}

                                        {!canConfirmColourMatch ? (
                                            <p className="mt-3 text-sm text-slate-400">
                                                {isDone ? null : 'A production supervisor handles the colour match on this order.'}
                                            </p>
                                        ) : isDone ? null : needsCustomer ? (
                                            <div className="mt-4 flex flex-col sm:flex-row gap-3">
                                                <input
                                                    type="text"
                                                    value={yarnDraft}
                                                    onChange={(e) => setYarnDraft(e.target.value)}
                                                    placeholder="Your closest yarn (e.g. Madeira 1176 Royal)"
                                                    className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-fuchsia-500/60 focus:border-fuchsia-500"
                                                />
                                                <Button
                                                    variant="primary"
                                                    disabled={proposeColourMatchMutation.isPending || !yarnDraft.trim()}
                                                    onClick={() => proposeColourMatchMutation.mutate(yarnDraft)}
                                                >
                                                    {order.colourEmailSentAt ? 'Resend to Customer' : 'Send to Customer'}
                                                </Button>
                                            </div>
                                        ) : (
                                            /* 'standard' — a colour we stock. One click, no email. */
                                            <div className="mt-4 flex flex-col sm:flex-row gap-3">
                                                <input
                                                    type="text"
                                                    value={yarnDraft}
                                                    onChange={(e) => setYarnDraft(e.target.value)}
                                                    placeholder={`Yarn for "${order.customerColourInput || ''}"`}
                                                    className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-fuchsia-500/60 focus:border-fuchsia-500"
                                                />
                                                <Button
                                                    variant="primary"
                                                    disabled={confirmColourMatchMutation.isPending || !yarnDraft.trim()}
                                                    onClick={() => confirmColourMatchMutation.mutate(yarnDraft)}
                                                >
                                                    Confirm Match
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

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
                                        {linkedCustomer && (
                                            <button
                                                onClick={() => navigate(`/portal-customers/${linkedCustomer.id}`)}
                                                className="text-xs font-normal text-brand-orange hover:underline"
                                            >
                                                View customer account
                                            </button>
                                        )}
                                    </h3>
                                    {!canViewShipping && <Lock className="w-4 h-4 text-slate-400" />}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div>
                                        <p className="text-xs font-medium text-slate-400 uppercase mb-1">Customer Name</p>
                                        <p className="font-medium text-white text-base">
                                            {canViewCustomerIdentity ? order.customerName : '•••••••• (Hidden)'}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-medium text-slate-400 uppercase mb-1">Email Address</p>
                                        <p className="font-medium text-white break-all">
                                            {canViewShipping && canViewCustomerIdentity ? order.customerEmail : '•••••••• (Hidden)'}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-medium text-slate-400 uppercase mb-1 flex items-center gap-1">
                                            <Smartphone className="w-3 h-3" /> Phone / Mobile
                                        </p>
                                        <p className="font-medium text-white">
                                            {canViewShipping && canViewCustomerIdentity ? (order.customerPhone || 'N/A') : '•••••••• (Hidden)'}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-medium text-slate-400 uppercase mb-1 flex items-center gap-1">
                                            <MapPin className="w-3 h-3" /> Shipping Address
                                        </p>
                                        <p className="font-medium text-white text-sm leading-relaxed">
                                            {canViewShipping && canViewCustomerIdentity ? (order.shippingAddress || 'No address provided') : '•••••••• (Hidden)'}
                                        </p>
                                    </div>
                                </div>
                            </SpotlightCard>
                        )}

                        {/* DESIGN & PRODUCTION INFO */}
                        {(canViewProduction || isShipping) ? (
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

                                {/* Sample Box add-on — production must include a sample box with this order */}
                                {order.sampleBox && (
                                    <div className="mt-6 pt-6 border-t border-slate-700/50">
                                        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                            📦 Include a Sample Box with this order
                                        </span>
                                    </div>
                                )}

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
                                                !isImageUrl(url) ? (
                                                <a
                                                    key={`mockup-${idx}`}
                                                    href={url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    title={attachmentFileName(url)}
                                                    className="relative group flex flex-col items-center justify-center gap-2 h-32 overflow-hidden rounded-lg border border-slate-600 hover:border-brand-orange bg-slate-800/60 transition-all"
                                                >
                                                    <FileText className="w-8 h-8 text-slate-400 group-hover:text-brand-orange transition-colors" />
                                                    <span className="px-2 text-[10px] text-slate-400 truncate max-w-full">{attachmentFileName(url)}</span>
                                                </a>
                                                ) : (
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
                                                )
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* DIGITIZER: Upload Mockup → Send for Approval (only while the order is awaiting a proof) */}
                                {canViewProduction && (order.status === OrderStatus.NEW_ORDER || order.status === OrderStatus.REVISION_REQUESTED) && (
                                    <div className="mt-6 pt-6 border-t border-slate-700/50">
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-xs font-medium text-brand-orange uppercase">Upload Mockup → Send for Approval</p>
                                            <span className="text-[11px] text-slate-400">{order.status.replace(/_/g, ' ')}</span>
                                        </div>
                                        <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                                            Upload the mockup/proof here, then <strong className="text-slate-300">Send for Approval</strong> — this moves the order to
                                            Awaiting Approval and emails the customer the approval request automatically. No need to route it through an agent.
                                        </p>
                                        <FileUploadSection
                                            title=""
                                            bucketName="order-attachments"
                                            folderPath={`mockups/${order.orderNumber}`}
                                            urls={mockupFiles}
                                            onUrlsChange={setMockupFiles}
                                        />
                                        <div className="mt-4 flex justify-end">
                                            <Button
                                                onClick={() => sendForApprovalMutation.mutate()}
                                                disabled={sendForApprovalMutation.isPending || mockupFiles.length === 0}
                                                title={mockupFiles.length === 0 ? 'Upload at least one mockup first' : 'Send the mockup to the customer for approval'}
                                            >
                                                {sendForApprovalMutation.isPending
                                                    ? <Spinner small />
                                                    : <span className="flex items-center gap-2"><Mail className="w-4 h-4" /> Send for Approval</span>}
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {/* Customer Reference Images Section */}
                                {(order.customerAttachmentUrls?.length || 0) > 0 && (
                                    <div className="mt-6 pt-6 border-t border-slate-700/50">
                                        <p className="text-xs font-medium text-slate-400 uppercase mb-4">Customer References</p>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                            {order.customerAttachmentUrls?.map((url, idx) => (
                                                !isImageUrl(url) ? (
                                                <a
                                                    key={`customer-${idx}`}
                                                    href={url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    title={attachmentFileName(url)}
                                                    className="relative group flex flex-col items-center justify-center gap-2 h-32 overflow-hidden rounded-lg border border-slate-600 hover:border-brand-orange bg-slate-800/60 transition-all"
                                                >
                                                    <FileText className="w-8 h-8 text-slate-400 group-hover:text-brand-orange transition-colors" />
                                                    <span className="px-2 text-[10px] text-slate-400 truncate max-w-full">{attachmentFileName(url)}</span>
                                                </a>
                                                ) : (
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
                                                )
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Production Files — inline editing. `!isAdmin` removed with the toggle
                                    above; an admin sees and edits these like anyone else with production access. */}
                                {isEditingProduction && (
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
                            <div className="p-8 rounded-xl border border-slate-700/50 bg-slate-800/20 flex flex-col items-center justify-center gap-3 text-slate-400 text-center">
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
                                {canViewCustomerIdentity && (
                                    <div className="flex justify-between items-center"><p className="text-slate-400 text-sm">Lead Source</p><p className="font-medium text-white">{isWebCheckoutAgent(order.salesAgent) ? leadSourceDisplay(order) : (order.leadSource || 'N/A')}</p></div>
                                )}
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
                                        <p className="font-bold text-white text-lg"><MaskedAmount value={order.orderAmount ?? 0} /></p>
                                    </div>
                                    <div className="w-full bg-slate-700 h-px my-1"></div>

                                    <div className="flex justify-between items-center">
                                        <p className="text-slate-400 text-sm">Amount Paid</p>
                                        <p className="font-medium text-green-400"><MaskedAmount value={order.amountPaid ?? 0} /></p>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <p className="text-slate-400 text-sm">Remaining</p>
                                        <p className="font-medium text-yellow-400"><MaskedAmount value={order.amountRemaining ?? 0} /></p>
                                    </div>

                                    {/* Detailed Breakdown (Admin Only) */}
                                    {isAdmin && (
                                        <div className="bg-slate-900/50 rounded-lg p-3 mt-4 space-y-2 border border-white/5">
                                            <p className="text-xs font-bold text-slate-400 uppercase mb-2">Internal Costs</p>
                                            <div className="flex justify-between items-center"><p className="text-xs text-slate-400">Production</p><p className="text-xs font-medium text-white">-<MaskedAmount value={order.productionCost ?? 0} /></p></div>
                                            <div className="flex justify-between items-center"><p className="text-xs text-slate-400">Shipping</p><p className="text-xs font-medium text-white">-<MaskedAmount value={order.shippingCost ?? 0} /></p></div>
                                            <div className="flex justify-between items-center"><p className="text-xs text-slate-400">Marketing</p><p className="text-xs font-medium text-white">-<MaskedAmount value={order.marketingCost ?? 0} /></p></div>
                                            <div className="border-t border-white/10 pt-2 mt-1 flex justify-between items-center">
                                                <p className="text-sm text-slate-300">Net Profit</p>
                                                <p className={`text-sm font-bold ${(order.profit ?? 0) >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>
                                                    <MaskedAmount value={order.profit ?? 0} />
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </SpotlightCard>
                        ) : (
                            // Empty state for non-financial users is handled by simply NOT rendering the card.
                            // Or you can render a locked state if you prefer:
                            <div className="p-6 rounded-xl border border-slate-700/50 bg-slate-800/20 flex items-center justify-center gap-3 text-slate-400">
                                <Lock className="w-5 h-5" />
                                <span>Financials restricted</span>
                            </div>
                        )}

                        {/* META CAPI STATUS PANEL (Admin Only) */}
                        {isAdmin && order && (
                            <div className="pt-2">
                                <MetaCapiPanel orderId={order.id} orderNumber={order.orderNumber} />
                            </div>
                        )}

                        {/* GENERATE SQUARE PAYMENT LINK — agent sends to customer */}
                        {canViewFinancials && order && (order.amountRemaining || 0) > 0 && (
                            <div className="pt-2">
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => setIsGenerateLinkModalOpen(true)}
                                    className="w-full bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 border border-blue-500/30"
                                >
                                    <Copy size={14} />
                                    <span>Generate Square Payment Link</span>
                                </Button>
                            </div>
                        )}

                        {/* MARK AS PAID (MANUAL) — Square / Bank / Cash / Other */}
                        {canViewFinancials && order && (order.amountRemaining || 0) > 0 && (
                            <div className="pt-2">
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => setIsMarkPaidModalOpen(true)}
                                    className="w-full bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 border border-emerald-500/30"
                                >
                                    <DollarSign size={14} />
                                    <span>Record Manual Payment</span>
                                </Button>
                            </div>
                        )}

                        {/* CORRECT PAYMENT — fix a payment recorded in error (only when something is recorded) */}
                        {canEditFinancials && order && (order.amountPaid || 0) > 0 && (
                            <div className="pt-2">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setIsCorrectPaymentOpen(true)}
                                    className="w-full bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 hover:text-amber-300 border border-amber-500/30"
                                >
                                    <RotateCcw size={14} />
                                    <span>Correct Payment</span>
                                </Button>
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

                {/* ✅ CUSTOMER NOTES & FEEDBACK (Full Width) */}
                {order && (
                    <div className="w-full animate-fadeIn lg:col-span-3">
                        <OrderNotesSection orderId={order.id} />
                    </div>
                )}

                {/* Customer ↔ Agent message thread (visible to customer in their portal).
                    Hidden entirely — not masked — from roles without customer identity. Masking
                    a conversation is meaningless: the customer's words are the content, and
                    Task 2.4 is explicit that digitizers never read customer messages directly.
                    A change request reaches them via the supervisor, not from here. */}
                {order && user && canViewCustomerIdentity && (
                    <div className="w-full animate-fadeIn lg:col-span-3">
                        <OrderMessageThread
                            orderId={order.id}
                            orderNumber={order.orderNumber}
                            viewer="agent"
                            currentUser={{
                                id: user.id,
                                email: user.email,
                                name: (user.user_metadata as any)?.full_name || user.email?.split('@')[0],
                            }}
                        />
                    </div>
                )}

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