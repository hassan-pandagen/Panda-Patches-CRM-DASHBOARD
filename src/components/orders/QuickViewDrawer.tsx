import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, Calendar, User, Mail, Phone, Package, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Order, OrderStatus } from '../../types';
import StatusBadge from '../ui/StatusBadge';

interface QuickViewDrawerProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
}

const QuickViewDrawer: React.FC<QuickViewDrawerProps> = ({ order, isOpen, onClose }) => {
  const navigate = useNavigate();

  if (!order) return null;

  const handleOpenFull = () => {
    onClose();
    navigate(`/order/${order.orderNumber}`);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[420px] bg-slate-900 border-l border-white/10 shadow-2xl overflow-y-auto"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-sm border-b border-white/10 p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Quick View</p>
                <h2 className="text-lg font-bold text-white mt-0.5">{order.orderNumber}</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleOpenFull}
                  className="flex items-center gap-1.5 px-3 py-2 bg-brand-orange/10 hover:bg-brand-orange/20 text-brand-orange rounded-lg text-xs font-medium transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Full View
                </button>
                <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-4 space-y-5">
              {/* Status & Customer */}
              <div className="flex items-center justify-between">
                <StatusBadge status={order.status as OrderStatus} />
                {order.isUrgent && (
                  <span className="px-2 py-1 bg-red-600 text-white text-[10px] font-bold rounded">URGENT</span>
                )}
              </div>

              {/* Customer Info */}
              <div className="bg-slate-800/50 rounded-xl p-4 space-y-3 border border-white/5">
                <h3 className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Customer</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-500" />
                    <span className="text-sm font-medium text-white">{order.customerName}</span>
                  </div>
                  {order.customerEmail && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-slate-500" />
                      <span className="text-sm text-slate-300">{order.customerEmail}</span>
                    </div>
                  )}
                  {order.customerPhone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-slate-500" />
                      <span className="text-sm text-slate-300">{order.customerPhone}</span>
                    </div>
                  )}
                  {order.shippingAddress && (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-slate-500 mt-0.5" />
                      <span className="text-sm text-slate-300">{order.shippingAddress}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Order Details */}
              <div className="bg-slate-800/50 rounded-xl p-4 space-y-3 border border-white/5">
                <h3 className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Order Details</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-slate-500">Date</p>
                    <p className="text-sm text-white font-medium flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {new Date(order.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Patch Type</p>
                    <p className="text-sm text-white font-medium flex items-center gap-1">
                      <Package className="w-3.5 h-3.5 text-slate-400" />
                      {order.patchesType || 'N/A'}
                    </p>
                  </div>
                  {order.designName && (
                    <div className="col-span-2">
                      <p className="text-xs text-slate-500">Design</p>
                      <p className="text-sm text-white font-medium">{order.designName}</p>
                    </div>
                  )}
                  {order.patchesQuantity && (
                    <div>
                      <p className="text-xs text-slate-500">Quantity</p>
                      <p className="text-sm text-white font-medium">{order.patchesQuantity} pcs</p>
                    </div>
                  )}
                  {order.salesAgent && (
                    <div>
                      <p className="text-xs text-slate-500">Sales Agent</p>
                      <p className="text-sm text-white font-medium">{order.salesAgent.split('@')[0]}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Financials */}
              <div className="bg-slate-800/50 rounded-xl p-4 space-y-3 border border-white/5">
                <h3 className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Financials</h3>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-xs text-slate-500">Amount</p>
                    <p className="text-base font-bold text-white">${(order.orderAmount || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Paid</p>
                    <p className="text-base font-bold text-emerald-400">${(order.amountPaid || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Pending</p>
                    <p className={`text-base font-bold ${(order.amountRemaining ?? 0) > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                      {(order.amountRemaining ?? 0) <= 0.01 ? 'Paid' : `$${(order.amountRemaining ?? 0).toLocaleString()}`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              {order.instructions && (
                <div className="bg-slate-800/50 rounded-xl p-4 space-y-2 border border-white/5">
                  <h3 className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Instructions</h3>
                  <p className="text-sm text-slate-300 whitespace-pre-wrap">{order.instructions}</p>
                </div>
              )}

              {/* Open Full Button */}
              <button
                onClick={handleOpenFull}
                className="w-full py-3 bg-brand-orange hover:bg-orange-600 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                Open Full Order <ExternalLink className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default QuickViewDrawer;
