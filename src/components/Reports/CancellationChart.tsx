import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Order } from '../../types';
import GlassCard from '../ui/GlassCard';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Ban, ArrowRight } from 'lucide-react';

interface CancellationChartProps {
  orders: Order[];
}

// ✅ 1. NEW COLOR MAPPING (Standardized)
const REASON_COLORS: Record<string, string> = {
  // --- CANCELLATIONS (Sales/Customer) ---
  "Customer Ghosted / No Reply": "#64748B", // Slate (Matches 'Unknown' Patch)
  "Changed Mind": "#8B5CF6",                // Purple (Neutral)
  "Price Too High": "#F59E0B",              // Amber (Cost Objection)
  "Duplicate Order": "#06B6D4",             // Cyan (Matches 'Leather')
  "Copyright / Policy Violation": "#EF4444",// Red (Compliance)
  
  // --- REFUNDS (Production/Quality) ---
  "Production Defect / Quality Issue": "#EF4444", // Red (Critical)
  "Shipping Lost / Damaged": "#EAB308",           // Yellow (Matches 'Bullion')
  "Late Delivery": "#FFFC00",                     // Neon Yellow (Matches 'Snapchat')
  "Design Mismatch": "#EC4899",                   // Pink (Creative)
  "Customer Error": "#10B981",                    // Emerald (Matches 'Woven')
  
  // --- DEFAULTS ---
  "Other": "#94A3B8",       // Slate Lighter (Matches 'Other' Source)
  "Unspecified": "#334155"
};

const CancellationChart: React.FC<CancellationChartProps> = ({ orders }) => {
  const navigate = useNavigate();

  // 2. Process Data
  const { 
    cancelData, refundData, 
    totalCancelCount, totalRefundCount, 
    lostRevenueCancel, lostRevenueRefund 
  } = useMemo(() => {
    const cancels: Record<string, number> = {};
    const refunds: Record<string, number> = {};
    let cancelLost = 0;
    let refundLost = 0;
    let cCount = 0;
    let rCount = 0;

    orders.forEach(order => {
      // Use originalAmount so we see the lost value
      const amount = (order as any).originalAmount || order.orderAmount || 0;

      if (order.status === 'CANCELLED') {
        const reason = order.reasonCategory || 'Unspecified';
        cancels[reason] = (cancels[reason] || 0) + 1;
        cancelLost += amount;
        cCount++;
      } else if (order.status === 'REFUNDED') {
        const reason = order.reasonCategory || 'Unspecified';
        refunds[reason] = (refunds[reason] || 0) + 1;
        refundLost += amount;
        rCount++;
      }
    });

    return {
      cancelData: Object.keys(cancels).map(k => ({ name: k, value: cancels[k] })),
      refundData: Object.keys(refunds).map(k => ({ name: k, value: refunds[k] })),
      totalCancelCount: cCount,
      totalRefundCount: rCount,
      lostRevenueCancel: cancelLost,
      lostRevenueRefund: refundLost
    };
  }, [orders]);

  if (totalCancelCount === 0 && totalRefundCount === 0) {
    return (
      <GlassCard title="Quality & Refunds">
        <div className="h-64 flex flex-col items-center justify-center text-gray-500">
          <p className="text-lg font-medium">No Data Available</p>
          <p className="text-sm">You have 0 cancelled or refunded orders.</p>
        </div>
      </GlassCard>
    );
  }

  // 3. Rich Tooltip (Matches your Revenue Chart style)
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <div className="bg-slate-900/95 backdrop-blur-xl border border-white/10 p-4 rounded-xl shadow-2xl min-w-[200px] animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/10">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: data.fill }}></span>
            <p className="font-bold text-white text-sm">{data.name}</p>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-400">Count:</span>
            <span className="text-white font-bold">{data.value} Orders</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* --- TOP METRICS (CLICKABLE) --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Left: Cancellation Stats */}
        <div 
          onClick={() => navigate('/orders?filter=CANCELLED')}
          className="group relative cursor-pointer"
        >
            <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500 to-orange-600 rounded-2xl opacity-20 group-hover:opacity-40 transition duration-500 blur"></div>
            <div className="relative bg-slate-900/60 backdrop-blur-xl border border-amber-500/30 rounded-2xl p-6 flex justify-between items-center hover:bg-slate-800/60 transition-all">
                <div>
                    <p className="text-amber-400 font-medium text-sm flex items-center gap-2">
                        <Ban className="w-4 h-4" /> Cancellations (Sales)
                    </p>
                    <p className="text-3xl font-bold text-white mt-1">{totalCancelCount}</p>
                    <p className="text-xs text-slate-400 mt-1">Lost Opportunity: <span className="text-white font-mono">${lostRevenueCancel.toLocaleString()}</span></p>
                </div>
                <ArrowRight className="w-5 h-5 text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0" />
            </div>
        </div>

        {/* Right: Refund Stats */}
        <div 
          onClick={() => navigate('/orders?filter=REFUNDED')}
          className="group relative cursor-pointer"
        >
            <div className="absolute -inset-0.5 bg-gradient-to-r from-red-500 to-pink-600 rounded-2xl opacity-20 group-hover:opacity-40 transition duration-500 blur"></div>
            <div className="relative bg-slate-900/60 backdrop-blur-xl border border-red-500/30 rounded-2xl p-6 flex justify-between items-center hover:bg-slate-800/60 transition-all">
                <div>
                    <p className="text-red-400 font-medium text-sm flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" /> Refunds (Quality)
                    </p>
                    <p className="text-3xl font-bold text-white mt-1">{totalRefundCount}</p>
                    <p className="text-xs text-slate-400 mt-1">Cash Returned: <span className="text-white font-mono">${lostRevenueRefund.toLocaleString()}</span></p>
                </div>
                <ArrowRight className="w-5 h-5 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0" />
            </div>
        </div>
      </div>

      {/* --- DUAL CHARTS --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* CHART 1: CANCELLATIONS */}
        <GlassCard title="Why Customers Cancelled">
          {totalCancelCount > 0 ? (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={cancelData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {/* ✅ APPLY COLORS HERE */}
                    {cancelData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={REASON_COLORS[entry.name] || '#64748B'} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px', color: '#cbd5e1' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 flex items-center justify-center text-slate-500 text-sm">No Cancellations</div>
          )}
        </GlassCard>

        {/* CHART 2: REFUNDS */}
        <GlassCard title="Why We Refunded">
          {totalRefundCount > 0 ? (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={refundData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {/* ✅ APPLY COLORS HERE */}
                    {refundData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={REASON_COLORS[entry.name] || '#64748B'} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px', color: '#cbd5e1' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
             <div className="h-72 flex items-center justify-center text-slate-500 text-sm">No Refunds (Good Job!)</div>
          )}
        </GlassCard>

      </div>
    </div>
  );
};

export default CancellationChart;