import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserPlus, ArrowRight, CheckCircle } from 'lucide-react';
import { OrderStatus } from '../../types';
import { supabase } from '../../services/supabaseClient';
import { useQueryClient } from '@tanstack/react-query';

interface BulkActionBarProps {
  selectedIds: string[];
  selectedOrders: { id: string; orderNumber: string }[];
  onClear: () => void;
  salesAgents: { email: string; name: string }[];
}

const STATUS_OPTIONS = [
  { value: OrderStatus.NEW_ORDER, label: 'New Order' },
  { value: OrderStatus.AWAITING_APPROVAL, label: 'Awaiting Approval' },
  { value: OrderStatus.IN_PRODUCTION, label: 'In Production' },
  { value: OrderStatus.SHIPPED, label: 'Shipped' },
  { value: OrderStatus.DELIVERED, label: 'Delivered' },
  { value: OrderStatus.COMPLETED, label: 'Completed' },
];

const BulkActionBar: React.FC<BulkActionBarProps> = ({ selectedIds, selectedOrders, onClear, salesAgents }) => {
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showAgentMenu, setShowAgentMenu] = useState(false);

  const handleBulkStatusChange = async (newStatus: string) => {
    setIsProcessing(true);
    setShowStatusMenu(false);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .in('id', selectedIds);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onClear();
    } catch (err) {
      console.error('Bulk status update failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkAssign = async (agentEmail: string) => {
    setIsProcessing(true);
    setShowAgentMenu(false);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ sales_agent: agentEmail })
        .in('id', selectedIds);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      onClear();
    } catch (err) {
      console.error('Bulk assign failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  if (selectedIds.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 md:left-auto md:translate-x-0 md:right-8"
      >
        <div className="flex items-center gap-3 bg-slate-900/95 backdrop-blur-xl border border-brand-orange/30 rounded-2xl px-5 py-3 shadow-2xl shadow-black/40">
          {/* Count */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-orange flex items-center justify-center text-white font-bold text-sm">
              {selectedIds.length}
            </div>
            <span className="text-sm text-slate-300 font-medium hidden sm:inline">selected</span>
          </div>

          <div className="w-px h-8 bg-slate-700" />

          {/* Change Status */}
          <div className="relative">
            <button
              onClick={() => { setShowStatusMenu(!showStatusMenu); setShowAgentMenu(false); }}
              disabled={isProcessing}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-medium text-white transition-colors min-h-[44px]"
            >
              <ArrowRight className="w-4 h-4 text-brand-orange" />
              <span className="hidden sm:inline">Change Status</span>
              <span className="sm:hidden">Status</span>
            </button>
            {showStatusMenu && (
              <div className="absolute bottom-full mb-2 left-0 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-2 min-w-[180px]">
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => handleBulkStatusChange(s.value)}
                    className="w-full text-left px-3 py-2.5 text-sm text-slate-200 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Assign Agent */}
          <div className="relative">
            <button
              onClick={() => { setShowAgentMenu(!showAgentMenu); setShowStatusMenu(false); }}
              disabled={isProcessing}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-medium text-white transition-colors min-h-[44px]"
            >
              <UserPlus className="w-4 h-4 text-blue-400" />
              <span className="hidden sm:inline">Assign Agent</span>
              <span className="sm:hidden">Assign</span>
            </button>
            {showAgentMenu && (
              <div className="absolute bottom-full mb-2 right-0 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-2 min-w-[220px] max-h-[300px] overflow-y-auto">
                {salesAgents.map((a) => (
                  <button
                    key={a.email}
                    onClick={() => handleBulkAssign(a.email)}
                    className="w-full text-left px-3 py-2.5 text-sm text-slate-200 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    <span className="font-medium">{a.name || a.email.split('@')[0]}</span>
                    <span className="text-xs text-slate-400 block">{a.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-px h-8 bg-slate-700" />

          {/* Clear */}
          <button
            onClick={onClear}
            className="p-2.5 hover:bg-slate-700 rounded-xl text-slate-400 hover:text-white transition-colors"
            title="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>

          {isProcessing && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 rounded-2xl">
              <div className="w-5 h-5 border-2 border-brand-orange/30 border-t-brand-orange rounded-full animate-spin" />
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default BulkActionBar;
