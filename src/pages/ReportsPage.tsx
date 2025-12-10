import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { Order, UserRole, OrderStatus } from '../types/index';
import Spinner from '../components/ui/Spinner';
import { LEAD_SOURCE_OPTIONS } from '../constants/index';
import DateRangeFilter, {
  DateRange,
  getDefaultRange,
} from "../components/ui/DateRangeFilter";
import { supabase } from '../services/supabaseClient';
import { queryKeys } from '../constants/queryKeys';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid, PieChart, Pie, Legend } from 'recharts';
import { mapDbToOrder } from '../services/orderService';

import { DollarSign, TrendingUp, Zap, Share2, Download, CheckCircle, AlertCircle, Award, ChevronDown, FileText, Lock, ShieldAlert } from 'lucide-react';
import { motion, Variants } from 'framer-motion';
import { TooltipProps } from 'recharts';
import { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CSVLink } from 'react-csv';
import ProfitLossReportComponent from '../components/Reports/ProfitLossReportComponent';
import CancellationChart from '../components/Reports/CancellationChart';
import { SOURCE_COLORS, PATCH_TYPE_COLORS } from '../constants/colors';


const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.1 }
    }
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0, transition: { type: "spring", stiffness: 100, damping: 15 }
  }
};

interface ReportComponentProps {
    orders: Order[];
    role?: UserRole | null;
}

// --- UI COMPONENTS ---

const StatCardWrapper: React.FC<{ children: React.ReactNode; gradient: string; className?: string; onClick?: () => void }> = ({ children, gradient, className = '', onClick }) => (
  <motion.div variants={cardVariants} className={className}>
    <div className={`group relative ${onClick ? 'cursor-pointer' : ''}`} onClick={onClick}>
      <div className={`absolute -inset-0.5 ${gradient} rounded-2xl opacity-0 group-hover:opacity-50 blur transition duration-500`} />
      <div className="relative bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 transform group-hover:scale-[1.02] transition-all duration-300 shadow-xl group-hover:shadow-2xl">
        {children}
      </div>
    </div>
  </motion.div>
);

const SimpleStatCard: React.FC<{ title: string; value: number | string; prefix?: string; suffix?: string; icon: React.ReactNode }> = ({ title, value, prefix = '', suffix = '', icon }) => (
  <div className="flex items-center justify-between">
    <div className="flex-1">
      <p className="text-sm font-medium text-slate-400 mb-1">{title}</p>
      <p className="text-3xl font-bold text-white">{prefix}{typeof value === 'number' ? value.toLocaleString() : value}{suffix}</p>
    </div>
    <div className="p-3 bg-gradient-to-br from-white/10 to-white/5 rounded-xl">{icon}</div>
  </div>
);

const CustomTooltip: React.FC<TooltipProps<ValueType, NameType>> = ({ active, payload, label }) => {
  // ✅ DAY 3 FIX: Add array bounds check
  if (active && payload && payload.length > 0) {
    const firstItem = payload[0];
    if (!firstItem) return null;
    
    const title = label || firstItem.name || 'Data';
    return (
      <div className="p-4 bg-slate-800/80 backdrop-blur-md border border-white/10 rounded-xl shadow-lg z-50">
        <p className="label text-base font-semibold text-white">{`${title}`}</p>
        <p className="intro text-sm text-cyan-400">{`${firstItem.name || 'Value'} : ${typeof firstItem.value === 'number' ? firstItem.value.toLocaleString() : firstItem.value}`}</p>
      </div>
    );
  }
  return null;
};

// --- 1. SALES REPORT (Visible to Admin & Sales Agent) ---
const SalesReportComponent: React.FC<ReportComponentProps> = ({ orders }) => {
    const navigate = useNavigate();
    
    // SAFEGUARDS: If DB sends NULL (masked), treat as 0
    const totalNetRevenue = useMemo(() => orders.reduce((sum, order) => sum + (order.orderAmount || 0), 0), [orders]);
    const totalCollected = useMemo(() => orders.reduce((sum, order) => sum + (order.amountPaid || 0), 0), [orders]);
    const totalAmountPending = useMemo(() => orders.reduce((sum, order) => sum + (order.amountRemaining || 0), 0), [orders]);
    const totalOrders = orders.length;
    const aov = totalOrders > 0 ? totalNetRevenue / totalOrders : 0;

    const pendingOrderNumbers = useMemo(() => 
        orders.filter(order => (order.amountRemaining || 0) > 0.01).map(order => order.orderNumber), 
    [orders]);

    const revenueTrend = useMemo(() => {
        const dailyRevenue = new Map<string, number>();
        for (const order of orders) {
            if (order.createdAt) {
                const date = new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                dailyRevenue.set(date, (dailyRevenue.get(date) || 0) + (order.orderAmount || 0)); // Use masked amount
            }
        }
        return Array.from(dailyRevenue.entries(), ([date, revenue]) => ({ date, revenue }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [orders]);

    return (
        <div className="space-y-6">
            <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCardWrapper gradient="bg-gradient-to-r from-brand-orange to-orange-600" onClick={() => navigate('/orders')}>
                    <SimpleStatCard title="My Sales Revenue" value={totalNetRevenue} prefix="$" icon={<DollarSign className="w-6 h-6 text-brand-orange" />} />
                </StatCardWrapper>
                <StatCardWrapper gradient="bg-gradient-to-r from-amber-500 to-yellow-500" onClick={() => navigate(`/orders?ids=${pendingOrderNumbers.join(',')}`)}>
                    <SimpleStatCard title="Pending Payment" value={totalAmountPending} prefix="$" icon={<AlertCircle className="w-6 h-6 text-amber-300" />} />
                </StatCardWrapper>
                <StatCardWrapper gradient="bg-gradient-to-r from-purple-500 to-pink-500" onClick={() => navigate('/orders')}>
                    <SimpleStatCard title="Avg. Order Value" value={aov.toFixed(2)} prefix="$" icon={<TrendingUp className="w-6 h-6 text-purple-400" />} />
                </StatCardWrapper>
                <StatCardWrapper gradient="bg-gradient-to-r from-green-500 to-emerald-500" onClick={() => navigate('/orders?filter=COMPLETED')}>
                    <SimpleStatCard title="Amount Collected" value={totalCollected} prefix="$" icon={<CheckCircle className="w-6 h-6 text-green-400" />} />
                </StatCardWrapper>
            </motion.div>

            <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
                <h4 className="text-lg font-semibold text-white mb-4">Performance Trend</h4>
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={revenueTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                        <XAxis dataKey="date" stroke="#cbd5e1" style={{ fontSize: '12px' }} />
                        <YAxis stroke="#cbd5e1" style={{ fontSize: '12px' }} tickFormatter={(v) => `$${v}`} />
                        <Tooltip content={<CustomTooltip />} />
                        <Line type="monotone" dataKey="revenue" stroke="#FB6E1D" strokeWidth={3} dot={{ fill: '#FB6E1D', r: 5 }} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

const LeadSourceTooltip = ({ active, payload, totalRevenue }: any) => {
  // ✅ DAY 3 FIX: Add array bounds check
  if (active && payload && payload.length > 0) {
    const firstItem = payload[0];
    if (!firstItem || !firstItem.payload) return null;
    
    const data = firstItem.payload;
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

const LeadSourceReportComponent: React.FC<ReportComponentProps> = ({ orders }) => {
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


const ProductionReportComponent: React.FC<ReportComponentProps> = ({ orders }) => {
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
                    <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                        {statusDistribution.map((group) => (
                            <div key={group.name} className="bg-slate-800/50 rounded-lg">
                                <button onClick={() => setExpandedStatus(expandedStatus === group.name ? null : group.name)} className="w-full flex items-center justify-between p-3 text-left hover:bg-white/5 transition-colors rounded-lg">
                                    <div className="flex items-center gap-3">
                                        <span className={`w-2.5 h-2.5 rounded-full ${getStatusColor(group.name.toUpperCase())}`}></span>
                                        
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
                    <h4 className="text-lg font-semibold text-white mb-4">Patch Types</h4>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={patchTypeStats} layout="vertical" margin={{ left: 10 }}>
                            <XAxis type="number" stroke="#94A3B8" hide />
                            <YAxis type="category" dataKey="name" stroke="#cbd5e1" width={90} style={{ fontSize: '12px' }} />
                            <Tooltip cursor={{ fill: 'rgba(100, 116, 139, 0.1)' }} content={<CustomTooltip />} />
                            <Bar dataKey="count" radius={[0, 6, 6, 0]} activeBar={false}>
                                {patchTypeStats.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={PATCH_TYPE_COLORS[entry.name] || '#64748b'} />
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
    
    const [searchParams, setSearchParams] = useSearchParams();
    const [dateRange, setDateRange] = React.useState<DateRange>(getDefaultRange);

    // --- 1. DYNAMIC TAB GENERATION (The Clean UI Fix) ---
    const availableReports = useMemo(() => {
        const tabs: { key: ReportType, label: string, icon: React.FC<any> }[] = [];

        // ADMIN: Sees Everything
        if (role === UserRole.ADMIN) {
            return [
                { key: 'sales', label: 'Sales', icon: TrendingUp },
                { key: 'production', label: 'Production', icon: Zap },
                { key: 'quality', label: 'Quality & Refunds', icon: ShieldAlert },
                { key: 'profitLoss', label: 'Profit & Loss', icon: FileText },
                { key: 'leadSource', label: 'Lead Source', icon: Share2 },
            ];
        }

        // SALES AGENT: Sees Sales (Their data), Production, Quality
        if (permissions?.orders_create && !permissions?.orders_view_all) {
             tabs.push({ key: 'sales', label: 'My Performance', icon: TrendingUp }); // Renamed for clarity
             tabs.push({ key: 'production', label: 'Production Queue', icon: Zap });
             tabs.push({ key: 'quality', label: 'Quality Issues', icon: ShieldAlert });
             return tabs;
        }

        // PRODUCTION: Sees ONLY Production
        if (permissions?.orders_edit_production) {
            tabs.push({ key: 'production', label: 'Production', icon: Zap });
            return tabs;
        }

        return tabs;
    }, [role, permissions]);

    // ✅ DAY 3 FIX: Safe array access with bounds check
     const activeReport = (searchParams.get('type') as ReportType) || (availableReports && availableReports.length > 0 ? availableReports[0]?.key : 'production');

     // --- 2. AUTO-REDIRECT SAFETY ---
     // If a user tries to access a tab they don't have, switch them to their first available tab.
     useEffect(() => {
        if (!isAuthLoading && availableReports && availableReports.length > 0) {
            const isValidReport = availableReports.find(r => r.key === activeReport);
            if (!isValidReport) {
                const firstReport = availableReports[0];
                if (firstReport) {
                    setSearchParams({ type: firstReport.key });
                }
            }
        }
    }, [availableReports, activeReport, isAuthLoading, setSearchParams]);


    // --- 3. DATA FETCHING (Trusting the Database) ---
    const { data: filteredOrders = [], isLoading: isQueryLoading } = useQuery({
        queryKey: queryKeys.orders.report(dateRange.startDate, dateRange.endDate),
        queryFn: async () => {
            if (!user) return [];
            const startDate = new Date(dateRange.startDate);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(dateRange.endDate);
            endDate.setHours(23, 59, 59, 999);

            // 1. Query the TABLE (snake_case source)
            let query = supabase
                .from('orders')
                .select('*')
                .gte('created_at', startDate.toISOString()) // 2. Filter using SNAKE_CASE
                .lte('created_at', endDate.toISOString()); // 2. Filter using SNAKE_CASE

            // RLS handles this, but explicit filtering is a good safeguard.
            if (role === UserRole.USER && !permissions?.orders_view_all) {
                query = query.eq('sales_agent', user.email);
            }

            const { data, error } = await query;
            if (error) throw error;
            // 3. Map immediately (Convert to Frontend Language)
            return (data || []).map(mapDbToOrder); 
        },
        enabled: !!user && !isAuthLoading && availableReports.length > 0,
    });

    // CSV Export Logic
    const csvConfig = useMemo(() => {
        if (!permissions?.reports_view_financials && activeReport !== 'production') return null;
        
        let headers = [
            { label: "Order #", key: "orderNumber" },
            { label: "Status", key: "status" },
            { label: "Customer", key: "customerName" }
        ];

        // Only add financial columns to CSV if they have permission
        if (permissions?.reports_view_financials) {
            headers.push(
                { label: "Total", key: "orderAmount" },
                { label: "Paid", key: "amountPaid" }
            );
        }
        
        return { headers, data: filteredOrders, filename: `report-${activeReport}.csv` };
    }, [filteredOrders, permissions, activeReport]);


    if (isAuthLoading || isQueryLoading) return <div className="flex h-screen items-center justify-center"><Spinner /></div>;
    if (availableReports.length === 0) return <div className="flex h-screen items-center justify-center text-slate-500">Access Restricted</div>;

    return (
        <div className="relative min-h-screen pb-10">
            {/* Background Blobs */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-brand-orange/5 rounded-full blur-3xl" />
            </div>

            <div className="relative z-10 space-y-8">
                {/* Header */}
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                    <div>
                        <h1 className="text-4xl font-bold text-white">Reports</h1>
                        <p className="text-slate-400 mt-2">
                            {role === UserRole.ADMIN ? "Company Overview" : 
                             permissions?.orders_edit_production ? "Production Dashboard" : "My Performance"}
                        </p>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                         <DateRangeFilter value={dateRange} onChange={setDateRange} />
                         {csvConfig && (
                            <CSVLink {...csvConfig} className="h-[42px] flex items-center gap-2 px-4 bg-emerald-600/80 hover:bg-emerald-600 rounded-lg text-white text-sm font-semibold transition-colors">
                                <Download className="w-4 h-4" /> <span>Export</span>
                            </CSVLink>
                        )}
                    </div>
                </div>

                {/* Navigation Tabs (Only shows allowed tabs) */}
                <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-2 shadow-xl inline-flex gap-2">
                    {availableReports.map(report => (
                        <button
                            key={report.key}
                            onClick={() => setSearchParams({ type: report.key })}
                            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                                activeReport === report.key 
                                    ? 'bg-brand-orange text-white shadow-lg' 
                                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                            }`}
                        >
                            <report.icon className="w-4 h-4" />
                            {report.label}
                        </button>
                    ))}
                </div>

                {/* Report Content */}
                <motion.div
                    key={activeReport}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
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