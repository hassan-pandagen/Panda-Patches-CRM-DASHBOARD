// src/pages/ReportsPage.tsx - FINAL, CLICKABLE, DRILL-DOWN ENABLED

import React, { useState, useCallback, useMemo, useEffect, FC } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { Order, UserRole, OrderStatus } from '../types/index';
import Spinner from '../components/ui/Spinner';
import { LEAD_SOURCE_OPTIONS } from '../constants/index';
import DateRangeFilter, { DateRange, getDefaultRange } from '../components/ui/DateRangeFilter';
import { supabase } from '../services/supabaseClient';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid, PieChart, Pie, Legend } from 'recharts';
import { DollarSign, Package, TrendingUp, Zap, Share2, Download, CheckCircle, AlertCircle, Award, ChevronDown, FileText, Lock, ShieldAlert } from 'lucide-react';
import { motion, Variants } from 'framer-motion';
import { TooltipProps } from 'recharts';
import { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CSVLink } from 'react-csv';
import ProfitLossReportComponent from '../components/Reports/ProfitLossReportComponent';
// ✅ IMPORT THE NEW CHART
import CancellationChart from '../components/Reports/CancellationChart';
import { SOURCE_COLORS, PATCH_TYPE_COLORS } from '../constants/colors';


const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.1
      }
    }
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 100, damping: 15 }
  }
};

interface ReportComponentProps {
    orders: Order[];
    role?: UserRole | null;
}

// --- UI COMPONENTS ---

const StatCardWrapper: FC<{ children: React.ReactNode; gradient: string; className?: string; onClick?: () => void }> = ({ children, gradient, className = '', onClick }) => (
  <motion.div variants={cardVariants} className={className}>
    <div className={`group relative ${onClick ? 'cursor-pointer' : ''}`} onClick={onClick}>
      <div className={`absolute -inset-0.5 ${gradient} rounded-2xl opacity-0 group-hover:opacity-50 blur transition duration-500`} />
      <div className="relative bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 transform group-hover:scale-[1.02] transition-all duration-300 shadow-xl group-hover:shadow-2xl">
        {children}
      </div>
    </div>
  </motion.div>
);

const SimpleStatCard: FC<{ title: string; value: number | string; prefix?: string; suffix?: string; icon: React.ReactNode }> = ({ title, value, prefix = '', suffix = '', icon }) => (
  <div className="flex items-center justify-between">
    <div className="flex-1">
      <p className="text-sm font-medium text-slate-400 mb-1">{title}</p>
      <p className="text-3xl font-bold text-white">{prefix}{typeof value === 'number' ? value.toLocaleString() : value}{suffix}</p>
    </div>
    <div className="p-3 bg-gradient-to-br from-white/10 to-white/5 rounded-xl">{icon}</div>
  </div>
);

const CustomTooltip: FC<TooltipProps<ValueType, NameType>> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const title = label || payload[0].name;
    return (
      <div className="p-4 bg-slate-800/80 backdrop-blur-md border border-white/10 rounded-xl shadow-lg z-50">
        <p className="label text-base font-semibold text-white">{`${title}`}</p>
        <p className="intro text-sm text-cyan-400">{`${payload[0].name} : ${typeof payload[0].value === 'number' ? payload[0].value.toLocaleString() : payload[0].value}`}</p>
      </div>
    );
  }
  return null;
};

// --- REPORT COMPONENTS (Sales, Production, etc.) ---


const SalesReportComponent: FC<ReportComponentProps> = ({ orders }) => {
    const navigate = useNavigate();
    // Use originalAmount for accurate revenue reporting before cancellations
    const totalGrossRevenue = useMemo(() => orders.reduce((sum, order) => sum + (order.originalAmount || 0), 0), [orders]);
    const totalNetRevenue = useMemo(() => orders.reduce((sum, order) => sum + (order.orderAmount || 0), 0), [orders]);
    const totalOrders = orders.length;
    const aov = totalOrders > 0 ? totalGrossRevenue / totalOrders : 0;
    const totalCollected = useMemo(() => orders.reduce((sum, order) => sum + (order.amountPaid || 0), 0), [orders]);

    // ✅ CORRECTED CALCULATION: Pending amount should be based on original amounts, not net revenue.
    const totalAmountPending = useMemo(() => orders.reduce((sum, order) => sum + ((order.originalAmount || 0) - (order.amountPaid || 0)), 0), [orders]);

    // ✅ NEW: Get the list of order numbers with pending payments
    const pendingOrderNumbers = useMemo(() => 
        orders
            .filter(order => order.amountRemaining > 0.01) // ✅ FIX: Use the pre-calculated amountRemaining for accuracy
            .map(order => order.orderNumber), 
    [orders]);

    const salesByAgent = useMemo(() => {
        const agentSales = orders.reduce((acc, order) => {
            const agentName = order.salesAgent || 'Unknown';
            if (!acc[agentName]) { acc[agentName] = { revenue: 0, orders: 0 }; }
            acc[agentName].revenue += (order.orderAmount || 0);
            acc[agentName].orders += 1;
            return acc;
        }, {} as Record<string, { revenue: number, orders: number }>);

        return Object.entries(agentSales).map(([name, data]) => ({
            name, ...data, aov: data.orders > 0 ? data.revenue / data.orders : 0
        })).sort((a, b) => b.revenue - a.revenue);
    }, [orders]);

    const revenueTrend = useMemo(() => {
        const dailyRevenue = new Map<string, number>();
        for (const order of orders) {
            if (order.createdAt) {
                const date = new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                dailyRevenue.set(date, (dailyRevenue.get(date) || 0) + (order.orderAmount || 0));
            }
        }
        return Array.from(dailyRevenue.entries(), ([date, revenue]) => ({ date, revenue }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [orders]);

    const COLORS = ['#3B82F6', '#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444'];

    return (
        <div className="space-y-6">
            <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCardWrapper gradient="bg-gradient-to-r from-brand-orange to-orange-600" onClick={() => navigate('/orders')}>
                    <SimpleStatCard title="Net Revenue" value={totalNetRevenue} prefix="$" icon={<DollarSign className="w-6 h-6 text-brand-orange" />} />
                </StatCardWrapper>
                <StatCardWrapper gradient="bg-gradient-to-r from-amber-500 to-yellow-500" onClick={() => navigate(`/orders?ids=${pendingOrderNumbers.join(',')}`)}>
                    <SimpleStatCard title="Amount Pending" value={totalAmountPending} prefix="$" icon={<AlertCircle className="w-6 h-6 text-amber-300" />} />
                </StatCardWrapper>
                <StatCardWrapper gradient="bg-gradient-to-r from-purple-500 to-pink-500" onClick={() => navigate('/orders')}>
                    <SimpleStatCard title="Avg. Order Value" value={aov.toFixed(2)} prefix="$" icon={<TrendingUp className="w-6 h-6 text-purple-400" />} />
                </StatCardWrapper>
                <StatCardWrapper gradient="bg-gradient-to-r from-green-500 to-emerald-500" onClick={() => navigate('/orders?filter=COMPLETED')}>
                    <SimpleStatCard title="Amount Collected" value={totalCollected} prefix="$" icon={<CheckCircle className="w-6 h-6 text-green-400" />} />
                </StatCardWrapper>
            </motion.div>

            <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
                <h4 className="text-lg font-semibold text-white mb-4">Revenue Trend</h4>
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={revenueTrend}>
                        <defs>
                            <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#FB6E1D" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#FB6E1D" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                        <XAxis dataKey="date" stroke="#cbd5e1" style={{ fontSize: '12px' }} />
                        <YAxis stroke="#cbd5e1" style={{ fontSize: '12px' }} tickFormatter={(v) => `$${(v/1000).toFixed(1)}k`} />
                        <Tooltip content={<CustomTooltip />} />
                        <Line type="monotone" dataKey="revenue" stroke="#FB6E1D" strokeWidth={3} dot={{ fill: '#FB6E1D', r: 5 }} fill="url(#revenueGradient)" />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-2 bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
                    <h4 className="text-lg font-semibold text-white mb-4">Top Sales Agents</h4>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={salesByAgent.slice(0, 6)} layout="vertical">
                            <XAxis type="number" hide /><YAxis type="category" dataKey="name" stroke="#cbd5e1" width={100} style={{ fontSize: '12px' }} />
                            <Tooltip
                                cursor={{ fill: 'rgba(100, 116, 139, 0.1)' }}
                                content={<CustomTooltip />}
                            />
                            <Bar dataKey="revenue" name="Revenue" radius={[0, 6, 6, 0]} barSize={32} activeBar={false}>
                                {salesByAgent.map((_, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="lg:col-span-3 bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
                    <h4 className="text-lg font-semibold text-white mb-4">Agent Ranking</h4>
                    <div className="overflow-y-auto h-[300px]">
                        <table className="w-full text-sm text-left text-slate-200">
                            <thead className="text-xs text-slate-400 uppercase bg-slate-800/50 sticky top-0">
                                <tr>
                                    <th className="px-4 py-2">Agent</th><th className="px-4 py-2 text-right">Revenue</th><th className="px-4 py-2 text-center">Orders</th><th className="px-4 py-2 text-right">AOV</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/50">
                                {salesByAgent.map((agent) => (
                                    <tr key={agent.name} className="hover:bg-slate-700/30 cursor-pointer transition-colors" onClick={() => navigate(`/orders?salesAgent=${encodeURIComponent(agent.name)}`)}>
                                        <td className="px-4 py-3 font-semibold text-white">{agent.name}</td>
                                        <td className="px-4 py-3 text-right">${agent.revenue.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-center">{agent.orders}</td>
                                        <td className="px-4 py-3 text-right text-cyan-400 font-medium">${agent.aov.toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

const LeadSourceTooltip = ({ active, payload, totalRevenue }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const percent = totalRevenue > 0 
      ? ((data.revenue / totalRevenue) * 100).toFixed(1) 
      : '0.0';

    return (
      <div className="bg-slate-900/95 backdrop-blur-xl border border-white/10 p-4 rounded-xl shadow-2xl min-w-[200px] animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/10">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: data.fill }}></span>
          <p className="font-bold text-white text-lg">{data.name}</p>
        </div>
        
        <div className="space-y-2">
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-400">Revenue:</span>
            <span className="text-emerald-400 font-bold text-base">${data.revenue.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-400">Orders:</span>
            <span className="text-white font-medium text-base">{data.orders}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-400">Market Share:</span>
            <span className="text-brand-orange font-bold text-base">{percent}%</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

const LeadSourceReportComponent: FC<ReportComponentProps> = ({ orders }) => {
    const navigate = useNavigate();
    
    const totalRevenue = useMemo(() => orders.reduce((sum, order) => sum + (order.orderAmount || 0), 0), [orders]);

    const leadSourceStats = useMemo(() => {
        const sourceStats = new Map<string, { revenue: number; orders: number }>();
        LEAD_SOURCE_OPTIONS.forEach(source => sourceStats.set(source, { revenue: 0, orders: 0 }));

        orders.forEach(order => {
            const sourceName = order.leadSource || 'Unknown';
            if (sourceStats.has(sourceName)) {
                const current = sourceStats.get(sourceName)!;
                current.revenue += (order.orderAmount || 0);
                current.orders += 1;
            }
        });

        return Array.from(sourceStats.entries())
            .map(([name, data]) => ({ name, ...data }))
            .sort((a, b) => b.revenue - a.revenue);
    }, [orders]);

    const pieChartData = useMemo(() => leadSourceStats.filter(item => item.revenue > 0), [leadSourceStats]);
    
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
                <h4 className="text-lg font-semibold text-white mb-4">Performance by Source</h4>
                 <div className="overflow-x-auto max-h-[400px] custom-scrollbar">
                    <table className="w-full text-left text-slate-200">
                        <thead className="text-xs font-bold text-slate-400 uppercase bg-slate-800/50 sticky top-0 tracking-wider">
                            <tr>
                                <th className="px-4 py-4 rounded-tl-lg">Platform</th>
                                <th className="px-4 py-4 text-center">Orders</th>
                                <th className="px-4 py-4 text-right rounded-tr-lg">Revenue</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {leadSourceStats.map((source, index) => (
                                <tr 
                                    key={index} 
                                    className="hover:bg-white/5 cursor-pointer transition-colors group" 
                                    onClick={() => navigate(`/orders?leadSource=${encodeURIComponent(source.name)}`)}
                                >
                                    <td className="px-4 py-3.5 text-sm font-semibold text-white flex items-center gap-3">
                                        <span 
                                            className={`w-2.5 h-2.5 rounded-full shadow-sm ${
                                                source.revenue > 0 
                                                ? '' 
                                                : 'bg-slate-600'
                                            }`}
                                            style={{ 
                                                backgroundColor: source.revenue > 0 ? (SOURCE_COLORS[source.name] || SOURCE_COLORS['Other']) : undefined 
                                            }}
                                        />
                                        <span className="group-hover:text-brand-orange transition-colors">{source.name}</span>
                                    </td>
                                    <td className="px-4 py-3.5 text-sm text-center text-slate-300 font-medium bg-white/0 group-hover:bg-white/5 rounded-lg transition-colors">
                                        {source.orders}
                                    </td>
                                    <td className="px-4 py-3.5 text-sm text-right text-emerald-400 font-bold tracking-wide">
                                        ${source.revenue.toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col">
                <div className="flex items-center justify-between mb-2">
                    <h4 className="text-lg font-semibold text-white">Revenue Distribution</h4>
                    <span className="text-xs font-medium text-slate-400 bg-slate-800 px-2 py-1 rounded-md">
                        Total: ${totalRevenue.toLocaleString()}
                    </span>
                </div>
                
                <div className="flex-grow flex items-center justify-center">
                    <ResponsiveContainer width="100%" height={400}>
                        <PieChart>
                            <Pie 
                                data={pieChartData} 
                                dataKey="revenue" 
                                nameKey="name" 
                                cx="50%" 
                                cy="50%" 
                                innerRadius={95}
                                outerRadius={135}
                                paddingAngle={4}
                                cornerRadius={6}
                                stroke="none"
                            >
                                {pieChartData.map((entry, index) => (
                                    <Cell 
                                        key={`cell-${index}`} 
                                        fill={SOURCE_COLORS[entry.name] || SOURCE_COLORS['Other']} 
                                        className="outline-none hover:opacity-80 transition-opacity duration-300 cursor-pointer"
                                        onClick={() => navigate(`/orders?leadSource=${encodeURIComponent(pieChartData[index].name)}`)}
                                    />
                                ))}
                            </Pie>
                            <Tooltip content={<LeadSourceTooltip totalRevenue={totalRevenue} />} />
                            <Legend 
                                layout="vertical" 
                                verticalAlign="middle" 
                                align="right"
                                iconType="circle"
                                iconSize={10}
                                wrapperStyle={{ fontSize: '14px', fontWeight: 500, color: '#e2e8f0', lineHeight: '24px' }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};


const ProductionReportComponent: FC<ReportComponentProps> = ({ orders }) => {
    const navigate = useNavigate();
    const inProductionCount = useMemo(() => orders.filter(o => o.status === OrderStatus.IN_PRODUCTION).length, [orders]);
    const revisionCount = useMemo(() => orders.filter(o => o.status === OrderStatus.REVISION_REQUESTED).length, [orders]);
    const urgentCount = useMemo(() => orders.filter(o => o.isUrgent).length, [orders]);
    const completionRate = orders.length > 0 ? ((orders.filter(o => o.status === OrderStatus.COMPLETED || o.status === OrderStatus.SHIPPED).length) / orders.length) * 100 : 0;
    const [expandedStatus, setExpandedStatus] = useState<string | null>(null);

  const getStatusColor = (status: string) => {
      if (status.includes('COMPLETED') || status.includes('SHIPPED')) return 'bg-emerald-500';
      if (status.includes('URGENT')) return 'bg-red-500 animate-pulse';
      if (status.includes('REVISION')) return 'bg-amber-500';
      if (status.includes('NEW')) return 'bg-brand-orange';
      if (status.includes('CANCELLED')) return 'bg-slate-500';
      return 'bg-blue-500';
  };

  const statusDistribution = useMemo(() => {
    const map: Record<string, Order[]> = {};
    orders.forEach(o => {
        if (!map[o.status]) map[o.status] = [];
        map[o.status].push(o);
    });
    return Object.entries(map).map(([status, list]) => ({ name: status.replace(/_/g, ' '), count: list.length, orders: list }));
  }, [orders]);

    const patchTypeStats = useMemo(() => {
        const stats: Record<string, number> = {};
        orders.forEach(o => { const type = o.patchesType || 'Unknown'; stats[type] = (stats[type] || 0) + 1; });
        return Object.entries(stats).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    }, [orders]);

    return (
        <div className="space-y-6">
            <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCardWrapper gradient="bg-gradient-to-r from-red-500 to-orange-500" onClick={() => navigate('/orders?filter=URGENT')}>
                    <SimpleStatCard title="Urgent Orders" value={urgentCount} icon={<AlertCircle className="w-6 h-6 text-red-300" />} />
                </StatCardWrapper>

                <StatCardWrapper gradient="bg-gradient-to-r from-blue-500 to-cyan-500" onClick={() => navigate('/orders?filter=IN_PRODUCTION')}>
                    <SimpleStatCard title="In Production" value={inProductionCount} icon={<Zap className="w-6 h-6 text-blue-400" />} />
                </StatCardWrapper>
                
                <StatCardWrapper gradient="bg-gradient-to-r from-amber-500 to-yellow-500" onClick={() => navigate('/orders?filter=REVISION_REQUESTED')}>
                    <SimpleStatCard title="Needs Revision" value={revisionCount} icon={<AlertCircle className="w-6 h-6 text-amber-400" />} />
                </StatCardWrapper>
                
                <StatCardWrapper gradient="bg-gradient-to-r from-green-500 to-emerald-500" onClick={() => navigate('/orders?filter=COMPLETED')}>
                    <SimpleStatCard title="Completion Rate" value={completionRate.toFixed(1)} suffix="%" icon={<Award className="w-6 h-6 text-green-400" />} />
                </StatCardWrapper>
            </motion.div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
                    <h4 className="text-lg font-semibold text-white mb-4">Production Breakdown</h4>
                    <div className="space-y-2">
                        {statusDistribution.map((group) => (
                            <div key={group.name} className="bg-slate-800/50 rounded-lg">
                                <button onClick={() => setExpandedStatus(expandedStatus === group.name ? null : group.name)} className="w-full flex items-center justify-between p-3 text-left hover:bg-white/5 transition-colors rounded-lg">
                                    <div className="flex items-center gap-3">
                                        <span className={`w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)] ${getStatusColor(group.name.toUpperCase())}`}></span>
                                        
                                        <span className="text-slate-200 text-sm font-medium capitalize">{group.name.toLowerCase()}</span>
                                    </div>
                                    <div className="flex items-center gap-3"><span className="font-bold text-white">{group.count}</span><ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedStatus === group.name ? 'rotate-180' : ''}`} /></div>
                                </button>
                                {expandedStatus === group.name && (
                                    <div className="px-3 pb-3 pt-1 border-t border-white/5">{group.orders.map(order => (<a key={order.id} href={`/order/${order.orderNumber}`} target="_blank" rel="noreferrer" className="block p-2 text-xs text-slate-300 hover:text-brand-orange truncate">{order.orderNumber} - {order.customerName}</a>))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
                <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
                    <h4 className="text-lg font-semibold text-white mb-4">Patch Types in Production</h4>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={patchTypeStats} layout="vertical" margin={{ left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis type="number" stroke="#94A3B8" hide />
                            <YAxis type="category" dataKey="name" stroke="#cbd5e1" width={90} style={{ fontSize: '12px', fontWeight: 500 }} />
                            <Tooltip cursor={{ fill: 'rgba(100, 116, 139, 0.1)' }} content={<CustomTooltip />} />
                            <Bar dataKey="count" name="Orders" radius={[0, 6, 6, 0]} activeBar={false}>
                                {patchTypeStats.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={PATCH_TYPE_COLORS[entry.name] || PATCH_TYPE_COLORS['Unknown']} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

// --- MAIN REPORT PAGE WRAPPER ---

type ReportType = 'sales' | 'production' | 'leadSource' | 'profitLoss' | 'quality';

const ReportsPage: React.FC = () => {
    const { user, role, permissions, isLoading: isAuthLoading } = useAuth();
    
    const isAdmin = role === UserRole.ADMIN;
    const canViewFinancials = isAdmin || permissions?.view_financials;
    const canViewProduction = isAdmin || permissions?.view_production;

    const availableReports = useMemo(() => {
        const options: { key: ReportType, label: string, icon: React.FC<any> }[] = [];
        
        // Sales and Quality reports are available to anyone with financial view
        if (canViewFinancials) {
            options.push({ key: 'sales', label: 'Sales', icon: TrendingUp });
            options.push({ key: 'quality', label: 'Quality & Refunds', icon: ShieldAlert });
        }
        
        // Profit & Loss and Lead Source reports are Admin-only
        if (isAdmin) {
            options.push({ key: 'profitLoss', label: 'Profit & Loss', icon: FileText });
            options.push({ key: 'leadSource', label: 'Lead Source', icon: Share2 });
        }

        // Production report is available to anyone with production view
        if (canViewProduction) {
            options.push({ key: 'production', label: 'Production', icon: Zap });
        }

        return options;
    }, [isAdmin, canViewFinancials, canViewProduction]);

  const [searchParams, setSearchParams] = useSearchParams();
  const activeReport = searchParams.get('type') || (availableReports.length > 0 ? availableReports[0].key : 'sales');

    const [dateRange, setDateRange] = useState<DateRange>(getDefaultRange);

    useEffect(() => {
    // If the active report from the URL isn't in the list of available reports,
    // redirect to the first available one.
    if (availableReports.length > 0 && !availableReports.find(r => r.key === activeReport)) {
      setSearchParams({ type: availableReports[0].key });
    }
  }, [availableReports, activeReport, setSearchParams]);

    const handleDateChange = useCallback((newDateRange: DateRange) => { setDateRange(newDateRange); }, []);
    const handleQuickFilter = useCallback((days: number) => {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - (days - 1));
        startDate.setHours(0, 0, 0, 0);
        setDateRange({ startDate: startDate.toISOString().split('T')[0], endDate: endDate.toISOString().split('T')[0] });
    }, []);

    // --- DATA FETCHING (WITH FIX FOR PROFIT CALCULATION) ---
    const { data: filteredOrders = [], isLoading: isQueryLoading, isError, error } = useQuery({
        queryKey: ['allOrdersReport', dateRange.startDate, dateRange.endDate],
        queryFn: async () => {
            if (!user) return [];
            const startDate = new Date(dateRange.startDate);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(dateRange.endDate);
            endDate.setHours(23, 59, 59, 999);

            const { data, error } = await supabase
                .from('orders_with_details')
                .select('*')
                .gte('created_at', startDate.toISOString())
                .lte('created_at', endDate.toISOString());

            if (error) throw error;

            return (data || []).map((item: any) => {
                // 1. EXTRACT RAW COSTS
                const prodCost = Number(item.production_cost || item.productionCost || 0);
                const shipCost = Number(item.shipping_cost || item.shippingCost || 0);
                const marketCost = Number(item.marketing_cost || item.marketingCost || 0);
                const totalCosts = prodCost + shipCost + marketCost;

                // 2. DETERMINE REAL REVENUE
                // If cancelled, Real Revenue is $0. Otherwise, it's the Order Amount.
                const isCancelled = item.status === 'CANCELLED' || item.status === 'REFUNDED';
                // Sales Report needs 0, but Quality Report needs the real number
                const rawAmount = Number(item.order_amount || item.orderAmount || 0); 
                const realRevenue = isCancelled ? 0 : rawAmount;

                // 3. CALCULATE REAL PROFIT
                const realProfit = realRevenue - totalCosts;

                // 4. RETURN MAPPED OBJECT
                return {
                    ...item,
                    
                    // ✅ NEW: Keep the original amount for the "Lost Revenue" chart
                    originalAmount: rawAmount, 

                    // Override with Corrected Financials
                    orderAmount: realRevenue,
                    productionCost: prodCost,
                    shippingCost: shipCost,
                    marketingCost: marketCost,
                    profit: realProfit,
                    
                    // Mappings
                    amountPaid: Number(item.amount_paid || item.amountPaid || 0),
                    reasonCategory: item.reason_category,
                    reasonDetails: item.reason_details,
                    salesAgent: item.sales_agent || item.salesAgent,
                    leadSource: item.lead_source || item.leadSource,
                    patchesType: item.patches_type || item.patchesType,
                };
            }) as Order[];
        },
        enabled: !!user && availableReports.length > 0,
        staleTime: 60000,
    });

    const getCsvConfig = () => {
        if (!canViewFinancials) return null;
        let headers = [{ label: "Order Number", key: "orderNumber" }, { label: "Date", key: "createdAt" }, { label: "Customer Name", key: "customerName" }, { label: "Total Amount", key: "orderAmount" }, { label: "Status", key: "status" }, { label: "Sales Agent", key: "salesAgent" }];
        if (activeReport === 'production') headers.push({ label: "Design Name", key: "designName" }, { label: "Quantity", key: "patchesQuantity" }, { label: "Urgent", key: "is_urgent" });
        return { headers, data: filteredOrders, filename: `panda-patches-${activeReport}.csv` };
    };
    const csvConfig = getCsvConfig();

    if (isAuthLoading || isQueryLoading) return <div className="flex h-screen items-center justify-center"><Spinner /></div>;
    if (isError) return <div className="text-center py-10 text-red-400">Error loading reports</div>;
    if (availableReports.length === 0) return <div className="flex h-screen items-center justify-center flex-col gap-4 text-slate-500"><Lock className="w-16 h-16 opacity-50" /><h2 className="text-xl font-semibold text-slate-300">Access Restricted</h2><p>You do not have permission to view any reports.</p></div>;

    return (
        <div className="relative min-h-screen pb-10">
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-gradient-to-br from-brand-orange/10 to-pink-500/10 rounded-full blur-3xl animate-blob" style={{ animationDuration: '8s' }} />
                <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] bg-gradient-to-br from-purple-500/10 to-blue-500/10 rounded-full blur-3xl animate-blob animation-delay-2000" style={{ animationDuration: '10s' }} />
            </div>

            <div className="relative z-10 space-y-8">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                    <div>
                        <h1 className="text-4xl font-bold text-white bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">Reports</h1>
                        <p className="text-slate-400 mt-2">Analytics and performance insights</p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                        <div className="flex items-center gap-2 bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-xl p-1.5 shadow-xl">
                            <button onClick={() => handleQuickFilter(7)} className="px-3 py-1.5 text-xs font-medium rounded-lg text-slate-300 hover:text-white hover:bg-white/10">7 Days</button>
                            <button onClick={() => handleQuickFilter(30)} className="px-3 py-1.5 text-xs font-medium rounded-lg text-slate-300 hover:text-white hover:bg-white/10">30 Days</button>
                            <button onClick={() => handleQuickFilter(60)} className="px-3 py-1.5 text-xs font-medium rounded-lg text-slate-300 hover:text-white hover:bg-white/10">60 Days</button>
                        </div>
                        <DateRangeFilter value={dateRange} onChange={handleDateChange} />
                        
                        {csvConfig && (
                            <CSVLink {...csvConfig} className="flex items-center gap-2 px-4 py-2 bg-emerald-600/80 hover:bg-emerald-600 rounded-lg text-white text-sm font-semibold transition-colors shadow-lg backdrop-blur-sm">
                                <Download className="w-4 h-4" /> CSV
                            </CSVLink>
                        )}
                    </div>
                </div>

                <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-2 shadow-xl inline-flex gap-2">
                    {availableReports.map(report => (
                        <button
                            key={report.key}
                            onClick={() => setSearchParams({ type: report.key })}
                            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                                activeReport === report.key 
                                    ? 'bg-brand-orange text-white shadow-lg shadow-brand-orange/30' 
                                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                            }`}
                        >
                            <report.icon className="w-4 h-4" />
                            {report.label}
                        </button>
                    ))}
                </div>

                <motion.div
                    key={activeReport}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    {activeReport === 'sales' && <SalesReportComponent orders={filteredOrders} role={role} />}
                    {activeReport === 'production' && <ProductionReportComponent orders={filteredOrders} />}
                    {activeReport === 'leadSource' && <LeadSourceReportComponent orders={filteredOrders} />}
                    {activeReport === 'profitLoss' && <ProfitLossReportComponent orders={filteredOrders} />}
                    {activeReport === 'quality' && <CancellationChart orders={filteredOrders} />}
                </motion.div>
            </div>
        </div>
    );
};

export default ReportsPage;