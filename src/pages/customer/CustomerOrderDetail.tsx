import React from 'react';
import { useParams, NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../services/supabaseClient';
import { mapDbToOrder } from '../../services/orderService';
import { Order, OrderHistoryEntry } from '../../types';
import { ArrowLeft, Package, Maximize, ExternalLink, Truck, MapPin } from 'lucide-react';

// --- CUSTOMER JOURNEY TIMELINE ---

const TIMELINE_STAGES = [
  { status: 'NEW_ORDER', label: 'Order Received', icon: '1' },
  { status: 'REVISION_REQUESTED', label: 'Design In Progress', icon: '2' },
  { status: 'AWAITING_CUSTOMER_APPROVAL', label: 'Awaiting Approval', icon: '3' },
  { status: 'APPROVED', label: 'Approved', icon: '4' },
  { status: 'IN_PRODUCTION', label: 'In Production', icon: '5' },
  { status: 'QUALITY_ASSURANCE', label: 'Quality Check', icon: '6' },
  { status: 'SHIPPED', label: 'Shipped', icon: '7' },
  { status: 'DELIVERED', label: 'Delivered', icon: '8' },
];

const STATUS_ORDER = TIMELINE_STAGES.map(s => s.status);

const getStageState = (stageStatus: string, currentStatus: string) => {
  const currentIdx = STATUS_ORDER.indexOf(currentStatus);
  const stageIdx = STATUS_ORDER.indexOf(stageStatus);

  if (currentIdx < 0) return 'pending'; // Unknown status
  if (stageIdx < currentIdx) return 'completed';
  if (stageIdx === currentIdx) return 'current';
  return 'pending';
};

const CustomerJourneyTimeline: React.FC<{ order: Order; history: any[] }> = ({ order, history }) => {
  const isCancelled = ['CANCELLED', 'REFUNDED'].includes(order.status);
  const isRemake = order.status === 'REMAKE';

  // Get timestamp for each stage from history
  const stageTimestamps: Record<string, string> = {};
  history.forEach(h => {
    if (h.field_changed === 'status' && h.new_value) {
      stageTimestamps[h.new_value] = h.changed_at;
    }
    if (h.field_changed === 'ORDER_CREATED') {
      stageTimestamps['NEW_ORDER'] = h.changed_at;
    }
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

      {/* Desktop Timeline (horizontal) */}
      <div className="hidden md:block">
        <div className="flex items-start justify-between relative">
          {/* Progress bar background */}
          <div className="absolute top-5 left-0 right-0 h-0.5 bg-slate-700" style={{ left: '6%', right: '6%' }} />
          {/* Progress bar fill */}
          {(() => {
            const currentIdx = STATUS_ORDER.indexOf(order.status);
            const progress = currentIdx >= 0 ? Math.min(((currentIdx) / (TIMELINE_STAGES.length - 1)) * 100, 100) : 0;
            return (
              <div
                className="absolute top-5 h-0.5 bg-brand-orange transition-all duration-1000"
                style={{ left: '6%', width: `${progress * 0.88}%` }}
              />
            );
          })()}

          {TIMELINE_STAGES.map((stage) => {
            const state = getStageState(stage.status, order.status);
            const timestamp = stageTimestamps[stage.status];

            return (
              <div key={stage.status} className="flex flex-col items-center text-center flex-1 relative z-10">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    state === 'completed'
                      ? 'bg-brand-orange text-white'
                      : state === 'current'
                      ? 'bg-brand-orange text-white ring-4 ring-brand-orange/30 animate-pulse'
                      : 'bg-slate-800 text-slate-500 border-2 border-slate-700'
                  }`}
                >
                  {state === 'completed' ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    stage.icon
                  )}
                </div>
                <p className={`text-xs mt-2 font-medium max-w-[80px] ${
                  state === 'pending' ? 'text-slate-600' : 'text-white'
                }`}>
                  {stage.label}
                </p>
                {timestamp && (
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile Timeline (vertical) */}
      <div className="md:hidden space-y-0">
        {TIMELINE_STAGES.map((stage, idx) => {
          const state = getStageState(stage.status, order.status);
          const timestamp = stageTimestamps[stage.status];
          const isLast = idx === TIMELINE_STAGES.length - 1;

          return (
            <div key={stage.status} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    state === 'completed'
                      ? 'bg-brand-orange text-white'
                      : state === 'current'
                      ? 'bg-brand-orange text-white ring-4 ring-brand-orange/30'
                      : 'bg-slate-800 text-slate-500 border-2 border-slate-700'
                  }`}
                >
                  {state === 'completed' ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    stage.icon
                  )}
                </div>
                {!isLast && (
                  <div className={`w-0.5 h-8 ${state === 'completed' ? 'bg-brand-orange' : 'bg-slate-700'}`} />
                )}
              </div>
              <div className="pb-6">
                <p className={`text-sm font-medium ${state === 'pending' ? 'text-slate-600' : 'text-white'}`}>
                  {stage.label}
                </p>
                {timestamp && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    {new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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

// --- MAIN ORDER DETAIL PAGE ---

const CustomerOrderDetail: React.FC = () => {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  // Fetch order
  const { data: order, isLoading, error } = useQuery({
    queryKey: ['customer-order', orderNumber],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('order_number', orderNumber)
        .single();
      if (error) throw error;
      return mapDbToOrder(data);
    },
    enabled: !!orderNumber,
  });

  // Fetch order history for timeline timestamps
  const { data: history = [] } = useQuery({
    queryKey: ['customer-order-history', order?.id],
    queryFn: async () => {
      if (!order?.id) return [];
      const { data, error } = await supabase
        .from('order_history')
        .select('*')
        .eq('order_id', order.id)
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

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Back + Header */}
      <div>
        <NavLink
          to="/customer/dashboard"
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft size={16} /> Back to My Orders
        </NavLink>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Order {order.orderNumber}</h1>
          <span className="text-xs text-slate-500">
            Placed {new Date(order.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
      </div>

      {/* Journey Timeline */}
      <CustomerJourneyTimeline order={order} history={history} />

      {/* Order Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Specs + Mockups */}
        <div className="lg:col-span-2 space-y-6">
          {/* Design Specs */}
          <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Design Details</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {order.designName && (
                <div>
                  <p className="text-xs text-slate-400 uppercase mb-1">Design Name</p>
                  <p className="text-sm font-medium text-white">{order.designName}</p>
                </div>
              )}
              {order.patchesType && (
                <div>
                  <p className="text-xs text-slate-400 uppercase mb-1">Patch Type</p>
                  <p className="text-sm font-medium text-white">{order.patchesType}</p>
                </div>
              )}
              {order.patchesQuantity && (
                <div>
                  <p className="text-xs text-slate-400 uppercase mb-1">Quantity</p>
                  <p className="text-sm font-medium text-white">{order.patchesQuantity} pcs</p>
                </div>
              )}
              {order.designSize && (
                <div>
                  <p className="text-xs text-slate-400 uppercase mb-1">Size</p>
                  <p className="text-sm font-medium text-white">{order.designSize}</p>
                </div>
              )}
              {order.designBacking && (
                <div>
                  <p className="text-xs text-slate-400 uppercase mb-1">Backing</p>
                  <p className="text-sm font-medium text-white">{order.designBacking}</p>
                </div>
              )}
              {order.borderType && (
                <div>
                  <p className="text-xs text-slate-400 uppercase mb-1">Border</p>
                  <p className="text-sm font-medium text-white">{order.borderType}</p>
                </div>
              )}
            </div>
          </div>

          {/* Mockups */}
          {order.mockupUrls && order.mockupUrls.length > 0 && (
            <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Design Mockups</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {order.mockupUrls.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => setPreviewUrl(url)}
                    className="relative group aspect-square rounded-xl overflow-hidden border border-slate-700 hover:border-brand-orange/50 transition-all"
                  >
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
          {order.status === 'SHIPPED' || order.status === 'DELIVERED' ? (
            <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Truck className="w-5 h-5 text-orange-400" />
                Shipping Information
              </h3>
              <div className="space-y-3">
                {order.shippingCarrier && (
                  <div>
                    <p className="text-xs text-slate-400 uppercase mb-1">Carrier</p>
                    <p className="text-sm font-medium text-white">{order.shippingCarrier}</p>
                  </div>
                )}
                {order.shippingTrackingNumber && (
                  <div>
                    <p className="text-xs text-slate-400 uppercase mb-1">Tracking Number</p>
                    <p className="text-sm font-medium text-brand-orange">{order.shippingTrackingNumber}</p>
                  </div>
                )}
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
          ) : null}
        </div>

        {/* Right: Summary */}
        <div className="space-y-6">
          <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Order Summary</h3>
            <div className="space-y-3">
              {order.orderAmount != null && (
                <div className="flex justify-between">
                  <span className="text-sm text-slate-400">Order Total</span>
                  <span className="text-sm font-semibold text-white">${order.orderAmount.toLocaleString()}</span>
                </div>
              )}
              {order.amountPaid != null && (
                <div className="flex justify-between">
                  <span className="text-sm text-slate-400">Paid</span>
                  <span className="text-sm font-medium text-emerald-400">${order.amountPaid.toLocaleString()}</span>
                </div>
              )}
              {order.amountRemaining != null && order.amountRemaining > 0 && (
                <div className="flex justify-between pt-2 border-t border-slate-700">
                  <span className="text-sm text-slate-400">Remaining</span>
                  <span className="text-sm font-bold text-brand-orange">${order.amountRemaining.toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>

          {/* Need Help */}
          <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-center">
            <h3 className="text-sm font-semibold text-white mb-2">Need Help?</h3>
            <p className="text-xs text-slate-400 mb-3">
              Have questions about this order? Chat with our team.
            </p>
            <p className="text-xs text-slate-500">
              Use the chat widget in the bottom right corner or email us at{' '}
              <a href="mailto:hello@pandapatches.com" className="text-brand-orange hover:underline">
                hello@pandapatches.com
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* Image Preview Modal */}
      {previewUrl && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setPreviewUrl(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/60 hover:text-white text-3xl"
            onClick={() => setPreviewUrl(null)}
          >
            &times;
          </button>
          <img
            src={previewUrl}
            alt="Preview"
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};

export default CustomerOrderDetail;
