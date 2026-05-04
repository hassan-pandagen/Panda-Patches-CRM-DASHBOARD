import React from 'react';
import { useParams, NavLink } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../services/supabaseClient';
import { mapDbToOrder } from '../../services/orderService';
import { useCustomerAuth } from '../../contexts/CustomerAuthContext';
import { Order } from '../../types';
import {
  ArrowLeft, Package, Maximize, Truck, MapPin,
  CheckCircle, MessageSquare, User, ThumbsUp, ThumbsDown,
  CreditCard,
} from 'lucide-react';
import OrderMessageThread from '../../components/messaging/OrderMessageThread';

// ── Timeline ─────────────────────────────────────────────────────────────────

const TIMELINE_STAGES = [
  { status: 'NEW_ORDER',                   label: 'Order Received'    },
  { status: 'REVISION_REQUESTED',          label: 'Design In Progress'},
  { status: 'AWAITING_CUSTOMER_APPROVAL',  label: 'Awaiting Approval' },
  { status: 'APPROVED',                    label: 'Approved'          },
  { status: 'IN_PRODUCTION',               label: 'In Production'     },
  { status: 'QUALITY_ASSURANCE',           label: 'Quality Check'     },
  { status: 'SHIPPED',                     label: 'Shipped'           },
  { status: 'DELIVERED',                   label: 'Delivered'         },
];

const STATUS_ORDER = TIMELINE_STAGES.map(s => s.status);

const getStageState = (stageStatus: string, currentStatus: string) => {
  const cur = STATUS_ORDER.indexOf(currentStatus);
  const stg = STATUS_ORDER.indexOf(stageStatus);
  if (cur < 0) return 'pending';
  if (stg < cur) return 'completed';
  if (stg === cur) return 'current';
  return 'pending';
};

const CustomerJourneyTimeline: React.FC<{ order: Order; history: any[] }> = ({ order, history }) => {
  const isCancelled = ['CANCELLED', 'REFUNDED'].includes(order.status);
  const isRemake    = order.status === 'REMAKE';

  const stageTimestamps: Record<string, string> = {};
  history.forEach(h => {
    if (h.field_changed === 'status' && h.new_value) stageTimestamps[h.new_value] = h.changed_at;
    if (h.field_changed === 'ORDER_CREATED')          stageTimestamps['NEW_ORDER']  = h.changed_at;
  });

  if (isCancelled) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center">
        <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
          <span className="text-red-400 text-xl">!</span>
        </div>
        <h3 className="text-lg font-semibold text-red-400 mb-1">
          Order {order.status === 'CANCELLED' ? 'Cancelled' : 'Refunded'}
        </h3>
        <p className="text-sm text-slate-400">
          {order.reasonDetails || 'Please contact us if you have questions.'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
      <h3 className="text-lg font-semibold text-white mb-6">Your Patch Journey</h3>
      {isRemake && (
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 mb-6 text-sm text-orange-400">
          We're remaking your order to ensure it meets quality standards. Hang tight!
        </div>
      )}

      {/* Desktop */}
      <div className="hidden md:block">
        <div className="flex items-start justify-between relative">
          <div className="absolute top-5 h-0.5 bg-slate-700" style={{ left: '6%', right: '6%' }} />
          {(() => {
            const idx      = STATUS_ORDER.indexOf(order.status);
            const progress = idx >= 0 ? Math.min((idx / (TIMELINE_STAGES.length - 1)) * 100, 100) : 0;
            return (
              <div
                className="absolute top-5 h-0.5 bg-brand-orange transition-all duration-1000"
                style={{ left: '6%', width: `${progress * 0.88}%` }}
              />
            );
          })()}
          {TIMELINE_STAGES.map((stage, i) => {
            const state = getStageState(stage.status, order.status);
            const ts    = stageTimestamps[stage.status];
            return (
              <div key={stage.status} className="flex flex-col items-center text-center flex-1 relative z-10">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  state === 'completed' ? 'bg-brand-orange text-white'
                  : state === 'current' ? 'bg-brand-orange text-white ring-4 ring-brand-orange/30 animate-pulse'
                  : 'bg-slate-800 text-slate-500 border-2 border-slate-700'
                }`}>
                  {state === 'completed'
                    ? <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    : i + 1}
                </div>
                <p className={`text-xs mt-2 font-medium max-w-[80px] ${state === 'pending' ? 'text-slate-600' : 'text-white'}`}>
                  {stage.label}
                </p>
                {ts && (
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile */}
      <div className="md:hidden space-y-0">
        {TIMELINE_STAGES.map((stage, idx) => {
          const state  = getStageState(stage.status, order.status);
          const ts     = stageTimestamps[stage.status];
          const isLast = idx === TIMELINE_STAGES.length - 1;
          return (
            <div key={stage.status} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  state === 'completed' ? 'bg-brand-orange text-white'
                  : state === 'current' ? 'bg-brand-orange text-white ring-4 ring-brand-orange/30'
                  : 'bg-slate-800 text-slate-500 border-2 border-slate-700'
                }`}>
                  {state === 'completed'
                    ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    : idx + 1}
                </div>
                {!isLast && <div className={`w-0.5 h-8 ${state === 'completed' ? 'bg-brand-orange' : 'bg-slate-700'}`} />}
              </div>
              <div className="pb-6">
                <p className={`text-sm font-medium ${state === 'pending' ? 'text-slate-600' : 'text-white'}`}>{stage.label}</p>
                {ts && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    {new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Mockup Approval ───────────────────────────────────────────────────────────

const MockupApproval: React.FC<{ order: Order; onApproved: () => void }> = ({ order, onApproved }) => {
  const queryClient = useQueryClient();
  const [changeNote, setChangeNote]     = React.useState('');
  const [showChangeForm, setShowChange] = React.useState(false);
  const [previewUrl, setPreviewUrl]     = React.useState<string | null>(null);

  const approveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'APPROVED' })
        .eq('id', order.id);
      if (error) throw error;
      // Log to order_history
      await supabase.from('order_history').insert({
        order_id:      order.id,
        user_email:    'customer',
        field_changed: 'status',
        old_value:     order.status,
        new_value:     'APPROVED',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-order', order.orderNumber] });
      onApproved();
    },
  });

  const requestChangeMutation = useMutation({
    mutationFn: async () => {
      if (!changeNote.trim()) throw new Error('Please describe the changes needed.');
      const { error } = await supabase
        .from('order_notes')
        .insert({
          order_id:   order.id,
          user_email: 'customer',
          user_name:  'Customer',
          note_type:  'customer_feedback',
          content:    `[Customer Requested Changes]: ${changeNote.trim()}`,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      setChangeNote('');
      setShowChange(false);
      queryClient.invalidateQueries({ queryKey: ['customer-order', order.orderNumber] });
    },
  });

  if (order.status !== 'AWAITING_CUSTOMER_APPROVAL') return null;

  return (
    <div className="bg-brand-orange/10 border-2 border-brand-orange/40 rounded-2xl p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 bg-brand-orange/20 rounded-lg shrink-0">
          <CheckCircle className="w-5 h-5 text-brand-orange" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Your Mockup is Ready!</h3>
          <p className="text-sm text-slate-400 mt-1">
            Please review the design mockup below and approve it or request changes.
            <span className="text-amber-400 font-medium"> Approving locks the order for production.</span>
          </p>
        </div>
      </div>

      {/* Mockup thumbnails */}
      {order.mockupUrls && order.mockupUrls.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-5">
          {order.mockupUrls.map((url, i) => (
            <button
              key={i}
              onClick={() => setPreviewUrl(url)}
              className="relative group aspect-square rounded-xl overflow-hidden border border-white/10 hover:border-brand-orange/50 transition-all"
            >
              <img src={url} alt={`Mockup ${i + 1}`} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Maximize className="w-5 h-5 text-white" />
              </div>
            </button>
          ))}
        </div>
      )}

      {!showChangeForm ? (
        <div className="flex gap-3">
          <button
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-xl font-semibold transition-all"
          >
            <ThumbsUp className="w-4 h-4" />
            {approveMutation.isPending ? 'Approving…' : 'Approve Design'}
          </button>
          <button
            onClick={() => setShowChange(true)}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold transition-all"
          >
            <ThumbsDown className="w-4 h-4" />
            Request Changes
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <textarea
            value={changeNote}
            onChange={e => setChangeNote(e.target.value)}
            placeholder="Describe what changes you'd like (colour, size, text, etc.)…"
            rows={3}
            className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-orange/50 resize-none"
          />
          {requestChangeMutation.isError && (
            <p className="text-xs text-red-400">{(requestChangeMutation.error as any)?.message}</p>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => requestChangeMutation.mutate()}
              disabled={requestChangeMutation.isPending || !changeNote.trim()}
              className="flex-1 py-3 bg-brand-orange hover:bg-brand-orange/90 disabled:opacity-50 text-white rounded-xl font-semibold transition-all"
            >
              {requestChangeMutation.isPending ? 'Sending…' : 'Send Feedback'}
            </button>
            <button
              onClick={() => { setShowChange(false); setChangeNote(''); }}
              className="px-5 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Full-screen preview */}
      {previewUrl && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 cursor-pointer" onClick={() => setPreviewUrl(null)}>
          <button className="absolute top-4 right-4 text-white/60 hover:text-white text-3xl" onClick={() => setPreviewUrl(null)}>&times;</button>
          <img src={previewUrl} alt="Preview" className="max-w-full max-h-[90vh] object-contain rounded-lg" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const CustomerOrderDetail: React.FC = () => {
  const { orderNumber }    = useParams<{ orderNumber: string }>();
  const { profile }        = useCustomerAuth();
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [approved, setApproved]     = React.useState(false);

  const { data: order, isLoading, error } = useQuery({
    queryKey: ['customer-order', orderNumber],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        // Never select production_cost, marketing_cost, profit — strip at query level
        .select(`
          id, order_number, customer_name, customer_email, cc_email,
          customer_phone, shipping_address, design_name, patches_type,
          patches_quantity, design_size, design_backing, border_type,
          instructions, mockup_urls, shipping_carrier,
          shipping_tracking_number, order_amount, amount_paid,
          status, reason_category, reason_details,
          sales_agent, is_urgent, lead_source,
          created_at, updated_at, created_by,
          revision_notes, redo_notes, rush_date, cc_email,
          customer_attachment_urls, production_file_urls,
          shipping_attachment_urls, redo_attachments, packing,
          is_urgent_approved, assigned_by, assigned_at, country, attribution
        `)
        .eq('order_number', orderNumber)
        .single();
      if (error) throw error;
      return mapDbToOrder(data);
    },
    enabled: !!orderNumber,
  });

  const { data: history = [] } = useQuery({
    queryKey: ['customer-order-history', order?.id],
    queryFn: async () => {
      if (!order?.id) return [];
      const { data, error } = await supabase
        .from('order_history')
        .select('field_changed, old_value, new_value, changed_at')
        .eq('order_id', order.id)
        .in('field_changed', ['status', 'ORDER_CREATED'])
        .order('changed_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!order?.id,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-10 h-10 border-4 border-brand-orange border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="text-center py-20">
        <Package className="w-16 h-16 text-slate-700 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-white mb-2">Order not found</h3>
        <NavLink to="/customer/dashboard" className="text-brand-orange hover:underline text-sm">
          Back to My Orders
        </NavLink>
      </div>
    );
  }

  const amountRemaining = (order.orderAmount || 0) - (order.amountPaid || 0);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Back + Header */}
      <div>
        <NavLink to="/customer/dashboard" className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors mb-4">
          <ArrowLeft size={16} /> Back to My Orders
        </NavLink>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Order {order.orderNumber}</h1>
          <span className="text-xs text-slate-500">
            Placed {new Date(order.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
      </div>

      {/* Mockup Approval Banner — shows only when status = AWAITING_CUSTOMER_APPROVAL */}
      {!approved && <MockupApproval order={order} onApproved={() => setApproved(true)} />}

      {approved && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
          <p className="text-sm text-green-300 font-medium">Design approved! Your order is now heading to production.</p>
        </div>
      )}

      {/* Journey Timeline */}
      <CustomerJourneyTimeline order={order} history={history} />

      {/* Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* Design Specs */}
          <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Design Details</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {order.designName       && <SpecItem label="Design Name"  value={order.designName} />}
              {order.patchesType      && <SpecItem label="Patch Type"   value={order.patchesType} />}
              {order.patchesQuantity  && <SpecItem label="Quantity"     value={`${order.patchesQuantity} pcs`} />}
              {order.designSize       && <SpecItem label="Size"         value={order.designSize} />}
              {order.designBacking    && <SpecItem label="Backing"      value={order.designBacking} />}
              {order.borderType       && <SpecItem label="Border"       value={order.borderType} />}
            </div>
          </div>

          {/* Mockups — only show if NOT awaiting approval (already shown in banner above) */}
          {order.status !== 'AWAITING_CUSTOMER_APPROVAL' && order.mockupUrls && order.mockupUrls.length > 0 && (
            <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Design Mockups</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {order.mockupUrls.map((url, i) => (
                  <button key={i} onClick={() => setPreviewUrl(url)}
                    className="relative group aspect-square rounded-xl overflow-hidden border border-slate-700 hover:border-brand-orange/50 transition-all">
                    <img src={url} alt={`Mockup ${i + 1}`} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Maximize className="w-6 h-6 text-white" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Shipping Info */}
          {(order.status === 'SHIPPED' || order.status === 'DELIVERED') && (
            <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Truck className="w-5 h-5 text-orange-400" /> Shipping Information
              </h3>
              <div className="space-y-3">
                {order.shippingCarrier         && <SpecItem label="Carrier"         value={order.shippingCarrier} />}
                {order.shippingTrackingNumber  && <SpecItem label="Tracking Number" value={order.shippingTrackingNumber} highlight />}
                {order.shippingAddress && (
                  <div>
                    <p className="text-xs text-slate-400 uppercase mb-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> Shipping To
                    </p>
                    <p className="text-sm text-white">{order.shippingAddress}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Order Summary — NO cost/margin/profit */}
          <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Order Summary</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-slate-400">Order Total</span>
                <span className="text-sm font-semibold text-white">${order.orderAmount?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-400">Paid</span>
                <span className="text-sm font-medium text-emerald-400">${order.amountPaid?.toFixed(2)}</span>
              </div>
              {amountRemaining > 0 && (
                <div className="flex justify-between pt-2 border-t border-slate-700">
                  <span className="text-sm text-slate-400">Balance Due</span>
                  <span className="text-sm font-bold text-brand-orange">${amountRemaining.toFixed(2)}</span>
                </div>
              )}
              {amountRemaining <= 0 && (
                <div className="flex items-center gap-2 pt-2 border-t border-slate-700">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-green-400 font-medium">Fully Paid</span>
                </div>
              )}
            </div>

            {/* Pay Balance via Stripe — only show if there's a balance due AND order is active */}
            {amountRemaining > 0 && !['CANCELLED', 'REFUNDED'].includes(order.status) && (
              <PayBalanceButton orderId={order.id} amount={amountRemaining} />
            )}
          </div>

          {/* Account Manager — generic, never expose agent email */}
          <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <User className="w-4 h-4 text-brand-orange" /> Your Account Manager
            </h3>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-brand-orange/20 flex items-center justify-center">
                <User className="w-4 h-4 text-brand-orange" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Panda Patches Team</p>
                <p className="text-xs text-slate-400">Account Manager</p>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Use the message thread below for questions about this order, or the live chat in the
              bottom-right for urgent help.
            </p>
          </div>
        </div>
      </div>

      {/* Per-Order Message Thread (customer ↔ assigned agent) */}
      <OrderMessageThread
        orderId={order.id}
        orderNumber={order.orderNumber}
        viewer="customer"
        currentUser={
          profile?.id
            ? {
                id: profile.id,
                email: profile.email,
                name: profile.full_name || profile.email?.split('@')[0],
              }
            : undefined
        }
      />

      {/* Image Preview Modal */}
      {previewUrl && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 cursor-pointer" onClick={() => setPreviewUrl(null)}>
          <button className="absolute top-4 right-4 text-white/60 hover:text-white text-3xl" onClick={() => setPreviewUrl(null)}>&times;</button>
          <img src={previewUrl} alt="Preview" className="max-w-full max-h-[90vh] object-contain rounded-lg" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
};

const SpecItem: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ label, value, highlight }) => (
  <div>
    <p className="text-xs text-slate-400 uppercase mb-1">{label}</p>
    <p className={`text-sm font-medium ${highlight ? 'text-brand-orange' : 'text-white'}`}>{value}</p>
  </div>
);

// ── Pay Balance via Stripe (hits create-stripe-checkout edge function) ──
const PayBalanceButton: React.FC<{ orderId: number; amount: number }> = ({ orderId, amount }) => {
  const [isCreating, setIsCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleClick = async () => {
    setIsCreating(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('create-stripe-checkout', {
        body: { order_id: orderId },
      });
      if (fnErr || data?.error) {
        throw new Error(data?.error || fnErr?.message || 'Could not create checkout session');
      }
      if (!data?.url) throw new Error('No checkout URL returned');
      // Redirect to Stripe-hosted Checkout
      window.location.href = data.url;
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Try again.');
      setIsCreating(false);
    }
  };

  return (
    <div className="mt-5 pt-5 border-t border-slate-700">
      <button
        onClick={handleClick}
        disabled={isCreating}
        className="w-full flex items-center justify-center gap-2 py-3 bg-brand-orange hover:bg-brand-orange/90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-all shadow-lg shadow-brand-orange/20"
      >
        <CreditCard className="w-4 h-4" />
        {isCreating ? 'Redirecting…' : `Pay Balance · $${amount.toFixed(2)}`}
      </button>
      {error && (
        <p className="text-xs text-red-400 mt-2 text-center">{error}</p>
      )}
      <p className="text-[10px] text-slate-500 text-center mt-2">
        Secure payment via Stripe · Card payment
      </p>
    </div>
  );
};

export default CustomerOrderDetail;
