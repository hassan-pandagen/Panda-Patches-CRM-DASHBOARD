// src/pages/ReportsPage.tsx

import React, { useState, useCallback, useMemo, FC } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { Order, UserRole, OrderStatus } from '../types/index';
import Spinner from '../components/ui/Spinner';
import DateRangeFilter, { DateRange, getDefaultRange } from '../components/ui/DateRangeFilter';
import { fetchOrdersBetween } from '../services/orderService';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from 'recharts';
import StatCard from '../components/ui/StatCard';
import { DollarSign, Package, TrendingUp, CheckCircle, Zap, AlertCircle, Award, Share2, Download, Clock, TrendingDown, Percent, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CSVLink } from 'react-csv';
import { getStatusInfo } from '../constants';
import ProfitLossReportComponent from '../components/Reports/ProfitLossReportComponent';

// --- Report Components (Your full UI code is preserved here and is correct) ---

interface ReportComponentProps {
    orders: Order[];
    role?: UserRole | null; // Make role optional
}

const SalesReportComponent: FC<ReportComponentProps> = ({ orders, role }) => {
    const navigate = useNavigate();
    const totalRevenue = useMemo(() => orders.reduce((sum, order) => sum + (order.orderAmount || 0), 0), [orders]);
    const totalOrders = orders.length;
    const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const completedOrdersCount = useMemo(() => orders.filter(o => o.status === 'COMPLETED').length, [orders]);
    const totalCollected = useMemo(() => orders.reduce((sum, order) => sum + (order.amountPaid || 0), 0), [orders]);
    const pendingAmount = useMemo(() => {
        // An order has a pending amount if it's not cancelled or refunded, and there's a balance.
        return orders.filter(o => ![OrderStatus.CANCELLED, OrderStatus.REFUNDED].includes(o.status as OrderStatus))
            .reduce((sum, order) => sum + order.amountRemaining, 0);
    }, [orders]);

    const salesByAgent = useMemo(() => {
        const agentSales = orders.reduce((acc, order) => {
            const agentName = order.salesAgent || 'Unknown';
            if (!acc[agentName]) { acc[agentName] = { revenue: 0, orders: 0 }; }
            acc[agentName].revenue += (order.orderAmount || 0);
            acc[agentName].orders += 1;
            return acc;
        }, {} as Record<string, { revenue: number, orders: number }>);

        return Object.entries(agentSales).map(([name, data]) => ({ 
            name, ...data, aov: data.orders > 0 ? data.revenue / data.orders : 0,
            percentOfTotal: totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0,
        })).sort((a, b) => b.revenue - a.revenue);
    }, [orders, totalRevenue]);

    const revenueTrend = useMemo(() => {
        const dailyRevenue = orders.reduce((acc, order) => {
            if (order.createdAt && !isNaN(new Date(order.createdAt).getTime())) {
                const date = new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                acc[date] = (acc[date] || 0) + (order.orderAmount || 0);
            }
            return acc;
        }, {} as Record<string, number>);
        
        return Object.entries(dailyRevenue)
            .map(([date, revenue]) => ({ date, revenue }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [orders]);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {role === UserRole.AGENT ? ( // Conditional rendering for AGENT role
                    <StatCard
                        title="Pending Amount"
                        value={`$${pendingAmount.toLocaleString()}`}
                        icon={<Clock className="w-6 h-6" />}
                        color="warning"
                        onClick={() => navigate('/orders?payment_status=pending')}
                        className="cursor-pointer hover:border-amber-400/50"
                    />
                ) : (
                    <StatCard
                        title="Total Revenue"
                        value={`$${totalRevenue.toLocaleString()}`}
                        icon={<DollarSign className="w-6 h-6" />}
                        color="primary"
                    />
                )}
                <StatCard 
                    title="Total Orders" 
                    value={totalOrders.toString()} 
                    icon={<Package className="w-6 h-6" />} 
                    color="info" 
                    onClick={() => navigate('/orders')}
                    className="cursor-pointer hover:border-blue-400/50"
                />
                <StatCard title="Avg. Order Value" value={`$${aov.toFixed(2)}`} icon={<TrendingUp className="w-6 h-6" />} color="info" />
                <StatCard title="Amount Collected" value={`$${totalCollected.toLocaleString()}`} icon={<CheckCircle className="w-6 h-6" />} color="success" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-3 bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
                    <h4 className="text-lg font-semibold text-white mb-4">Revenue Trend</h4>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={revenueTrend}>
                            <defs> <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1"> <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/> <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/> </linearGradient> </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis dataKey="date" stroke="#94A3B8" tick={{ fill: '#CBD5E1', fontSize: 12 }} />
                            <YAxis stroke="#94A3B8" tickFormatter={(value) => `$${(value as number / 1000)}k`} />
                            <Tooltip contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '0.75rem' }} formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']} />
                            <Line type="monotone" dataKey="revenue" stroke="#3B82F6" strokeWidth={2} dot={false} fill="url(#revenueGradient)" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
                <div className="lg:col-span-2 bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
                    <h4 className="text-lg font-semibold text-white mb-4">Sales by Agent</h4>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={salesByAgent.slice(0, 8)} layout="vertical" margin={{ left: 20 }}>
                            <defs> <linearGradient id="agentBarGradient" x1="0" y1="0" x2="1" y2="0"> <stop offset="0%" stopColor="#06B6D4" stopOpacity={0.8} /> <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.8} /> </linearGradient> </defs>
                            <XAxis type="number" hide />
                            <YAxis type="category" dataKey="name" stroke="#94A3B8" width={80} tick={{ fill: '#F8FAFC', fontSize: 12 }} axisLine={false} tickLine={false} />
                            <Tooltip cursor={{ fill: 'rgba(6, 182, 212, 0.1)' }} contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '0.75rem' }} formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']} />
                            <Bar dataKey="revenue" fill="url(#agentBarGradient)" radius={[0, 4, 4, 0]} background={{ fill: 'rgba(255,255,255,0.05)', radius: 4 }} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
            <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
                <h4 className="text-lg font-semibold text-white mb-4">Top Performing Agents</h4>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-slate-300">
                        <thead className="text-xs text-slate-400 uppercase bg-slate-800/50">
                            <tr><th className="px-4 py-3">Rank</th><th className="px-4 py-3">Agent</th><th className="px-4 py-3">Orders</th><th className="px-4 py-3 text-right">Revenue</th><th className="px-4 py-3 text-right">% of Total</th><th className="px-4 py-3 text-right">Avg. Value</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50">
                            {salesByAgent.map((agent, index) => (
                                <tr 
                                    key={`${agent.name}-${index}`} 
                                    className="hover:bg-slate-700/30 cursor-pointer"
                                    onClick={() => navigate(`/orders?sales_agent=${encodeURIComponent(agent.name)}`)}
                                >
                                    <td className="px-4 py-3 font-medium">#{index + 1}</td>
                                    <td className="px-4 py-3 font-semibold text-white group-hover:text-blue-400">{agent.name}</td>
                                    <td className="px-4 py-3 text-center">{agent.orders}</td>
                                    <td className="px-4 py-3 text-right font-semibold text-white">${agent.revenue.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right text-cyan-400">{agent.percentOfTotal.toFixed(1)}%</td>
                                    <td className="px-4 py-3 text-right">${agent.aov.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const ProductionReportComponent: FC<ReportComponentProps> = ({ orders }) => {
    const navigate = useNavigate();
    const inProductionCount = useMemo(() => orders.filter(o => o.status === 'IN_PRODUCTION').length, [orders]);
    const totalOrders = orders.length;
    const urgentCount = useMemo(() => orders.filter(o => o.is_urgent && o.status !== 'COMPLETED' && o.status !== 'SHIPPED' && o.status !== 'DELIVERED').length, [orders]);
    const redoCount = useMemo(() => {
        return orders.filter(
          (o) => !!o.redoNotes || !!o.revisionNotes || o.status === 'REVISION_REQUESTED'
        ).length;
    }, [orders]);
    const qualityScore = totalOrders > 0 ? ((totalOrders - redoCount) / totalOrders) * 100 : 100;

    const productionByType = useMemo(() => {
        const typeCounts = orders.reduce((acc, order) => {
            const type = order.patchesType || 'Unknown'; acc[type] = (acc[type] || 0) + 1; return acc;
        }, {} as Record<string, number>);
        return Object.entries(typeCounts).map(([name, value]) => ({ name, value }));
    }, [orders]);

    const statusDistribution = useMemo(() => {
        const statusCounts = orders.reduce((acc, order) => {
            // --- PRODUCTION REPORT FIX #1: Use the status directly, not a label ---
            // The getStatusInfo function is not available here, and it's better
            // to use the raw status and format it in the chart.
            const statusLabel = getStatusInfo(order.status)?.label || order.status;
            acc[statusLabel] = (acc[statusLabel] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        // --- PRODUCTION REPORT FIX #2: Sort the data for a more organized chart ---
        return Object.entries(statusCounts).map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count);
    }, [orders]);

    const COLORS = ['#3B82F6', '#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444'];

    return (
        <div className="space-y-6">
            <h3 className="text-2xl font-semibold text-slate-100">Production Overview</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard 
                    title="Orders In Production" 
                    value={inProductionCount.toString()} 
                    icon={<Zap className="w-6 h-6" />} 
                    color="primary" 
                    onClick={() => navigate('/orders?status=IN_PRODUCTION')}
                    className="cursor-pointer hover:border-blue-400/50"
                />
                <StatCard 
                    title="Urgent Queue" 
                    value={urgentCount.toString()} 
                    icon={<AlertCircle className="w-6 h-6" />} 
                    color="warning" 
                    onClick={() => navigate('/orders?filter=urgent')}
                    className="cursor-pointer hover:border-amber-400/50"
                />
                <StatCard 
                    title="Redo/Revision Rate" 
                    value={`${((redoCount / totalOrders) * 100 || 0).toFixed(1)}%`} 
                    icon={<AlertCircle className="w-6 h-6" />} color="error" 
                />
                <StatCard title="Quality Score" value={`${qualityScore.toFixed(1)}%`} icon={<Award className="w-6 h-6" />} color="success" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
                    <h4 className="text-lg font-semibold text-white mb-4">Production by Patch Type</h4>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie data={productionByType} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} fill="#8884d8" label>
                                {productionByType.map((_, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                            </Pie>
                            <Tooltip contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '0.75rem' }} itemStyle={{ color: '#FFFFFF' }} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
                    <h4 className="text-lg font-semibold text-white mb-4">Order Status Distribution</h4>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={statusDistribution}>
                            <XAxis dataKey="name" stroke="#94A3B8" tick={{ fill: '#CBD5E1', fontSize: 10 }} angle={-45} textAnchor="end" height={70} interval={0} />
                            <YAxis stroke="#94A3B8" />
                            <Tooltip cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }} contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '0.75rem' }} />
                            <Bar dataKey="count" fill="#06B6D4" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

const LeadSourceReportComponent: FC<ReportComponentProps> = ({ orders }) => {
    const navigate = useNavigate();
    const leadSourceStats = useMemo(() => {
        const sourceStats = orders.reduce((acc, order) => {
            const source = order.leadSource || 'Unknown';
            if (!acc[source]) {
                acc[source] = { orders: 0, revenue: 0 };
            }
            acc[source].orders += 1;
            acc[source].revenue += order.orderAmount || 0;
            return acc;
        }, {} as Record<string, { orders: number, revenue: number }>);

        const totalRevenue = Object.values(sourceStats).reduce((sum, { revenue }) => sum + revenue, 0);

        return Object.entries(sourceStats).map(([name, data]) => ({
            name,
            ...data,
            aov: data.orders > 0 ? data.revenue / data.orders : 0,
            percentOfTotal: totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0,
        })).sort((a, b) => b.revenue - a.revenue);
    }, [orders]);

    const topByRevenue = leadSourceStats[0];
    const topByOrders = useMemo(() => [...leadSourceStats].sort((a, b) => b.orders - a.orders)[0], [leadSourceStats]);
    const topByAOV = useMemo(() => [...leadSourceStats].sort((a, b) => b.aov - a.aov)[0], [leadSourceStats]);

    const COLORS = ['#3B82F6', '#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#EC4899'];

    const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
        const RADIAN = Math.PI / 180;
        const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
        const x = cx + radius * Math.cos(-midAngle * RADIAN);
        const y = cy + radius * Math.sin(-midAngle * RADIAN);
        return (<text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize="12px">{`${(percent * 100).toFixed(0)}%`}</text>);
    };

    return (
        <div className="space-y-6">
            <h3 className="text-2xl font-semibold text-slate-100">Lead Source Performance</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard 
                    title="Top Platform by Revenue" 
                    value={topByRevenue?.name || 'N/A'} 
                    subtitle={`$${(topByRevenue?.revenue || 0).toLocaleString()}`} 
                    icon={<DollarSign className="w-6 h-6" />} 
                    color="primary" 
                    onClick={() => topByRevenue && navigate(`/orders?lead_source=${encodeURIComponent(topByRevenue.name)}`)}
                    className={topByRevenue ? "cursor-pointer hover:border-blue-400/50" : ""}
                />
                <StatCard 
                    title="Top Platform by Orders" 
                    value={topByOrders?.name || 'N/A'} 
                    subtitle={`${topByOrders?.orders || 0} orders`} 
                    icon={<Package className="w-6 h-6" />} 
                    color="info" 
                    onClick={() => topByOrders && navigate(`/orders?lead_source=${encodeURIComponent(topByOrders.name)}`)}
                    className={topByOrders ? "cursor-pointer hover:border-cyan-400/50" : ""}
                />
                <StatCard 
                    title="Most Valuable Platform (AOV)" 
                    value={topByAOV?.name || 'N/A'} 
                    subtitle={`$${(topByAOV?.aov || 0).toFixed(2)} avg. value`} 
                    icon={<TrendingUp className="w-6 h-6" />} 
                    color="success" 
                    onClick={() => topByAOV && navigate(`/orders?lead_source=${encodeURIComponent(topByAOV.name)}`)}
                    className={topByAOV ? "cursor-pointer hover:border-emerald-400/50" : ""}
                />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-3 bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
                    <h4 className="text-lg font-semibold text-white mb-4">Source Breakdown</h4>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-slate-300">
                            <thead className="text-xs text-slate-400 uppercase bg-slate-800/50">
                                <tr>
                                    <th className="px-4 py-3">Platform</th>
                                    <th className="px-4 py-3 text-center">Orders</th>
                                    <th className="px-4 py-3 text-right">Revenue</th>
                                    <th className="px-4 py-3 text-right">% of Total</th>
                                    <th className="px-4 py-3 text-right">Avg. Order Value</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/50">
                                {leadSourceStats.map((source, index) => (
                                    <tr 
                                        key={`${source.name}-${index}`} 
                                        className="hover:bg-slate-700/30 cursor-pointer"
                                        onClick={() => navigate(`/orders?lead_source=${encodeURIComponent(source.name)}`)}
                                    >
                                        <td className="px-4 py-3 font-semibold text-white group-hover:text-blue-400">{source.name}</td>
                                        <td className="px-4 py-3 text-center">{source.orders}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-white">${source.revenue.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right text-cyan-400">{source.percentOfTotal.toFixed(1)}%</td>
                                        <td className="px-4 py-3 text-right">${source.aov.toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div className="lg:col-span-2 bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
                    <h4 className="text-lg font-semibold text-white mb-4">Order Volume by Source</h4>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie data={leadSourceStats} dataKey="orders" nameKey="name" cx="50%" cy="50%" outerRadius={120} fill="#8884d8" labelLine={false} label={renderCustomizedLabel}>
                                {leadSourceStats.map((_, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                            </Pie>
                            <Tooltip contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '0.75rem' }} itemStyle={{ color: 'white' }} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

type ReportType = 'sales' | 'production' | 'leadSource' | 'profitLoss';

const reportOptions: { key: ReportType, label: string, roles: UserRole[], icon: React.FC<any> }[] = [
    { key: 'sales', label: 'Sales', roles: [UserRole.ADMIN, UserRole.AGENT], icon: TrendingUp },
    { key: 'production', label: 'Production', roles: [UserRole.ADMIN, UserRole.PRODUCTION], icon: Zap },
    { key: 'profitLoss', label: 'Profit & Loss', roles: [UserRole.ADMIN], icon: FileText },
    { key: 'leadSource', label: 'Lead Source', roles: [UserRole.ADMIN], icon: Share2 },
];

const getAvailableReports = (role: UserRole | null) => {
    if (!role) return [];
    return reportOptions.filter(opt => opt.roles.includes(role));
};

const getInitialReport = (role: UserRole | null): ReportType => {
    if (role === UserRole.AGENT) return 'sales';
    if (role === UserRole.PRODUCTION) return 'production';
    return 'sales'; // Default for ADMIN
};

const ReportsPage: React.FC = () => {
    const { user, role, isLoading: isAuthLoading } = useAuth();
    
    const [dateRange, setDateRange] = useState<DateRange>(getDefaultRange);
    const [activeReport, setActiveReport] = useState<ReportType>(() => getInitialReport(role));
    const availableReports = useMemo(() => getAvailableReports(role), [role]);

    const handleDateChange = useCallback((newDateRange: DateRange) => { setDateRange(newDateRange); }, []);
    const handleQuickFilter = useCallback((days: number) => {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - (days - 1));
        startDate.setHours(0, 0, 0, 0);
        setDateRange({ 
            startDate: startDate.toISOString().split('T')[0], 
            endDate: endDate.toISOString().split('T')[0] 
        });
    }, []);

    const { data: filteredOrders = [], isLoading: isQueryLoading, isError, error } = useQuery({
        queryKey: ['allOrdersReport', dateRange.startDate, dateRange.endDate],
        queryFn: async () => {
            const startDate = new Date(dateRange.startDate);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(dateRange.endDate);
            endDate.setHours(23, 59, 59, 999);
            return fetchOrdersBetween(startDate.toISOString(), endDate.toISOString());
        },
        enabled: !!user,
        staleTime: 60000,
    });

    // --- FIX: Move useMemo hook to the top level of the component ---
    const sanitizedOrders = useMemo(() => {
        if (role === UserRole.PRODUCTION) {
            // For production role, filter out financial data
            return filteredOrders.map(({ orderAmount, amountPaid, amountRemaining, ...remaningOrderData }) => remaningOrderData) as Order[];
        }
        return filteredOrders;
    }, [filteredOrders, role]);

    const getCsvConfig = () => {
        let headers: { label: string, key: string }[] = [];
        let data: Order[] = filteredOrders;
        const baseHeaders = [
            { label: "Order Number", key: "orderNumber" },
            { label: "Date", key: "createdAt" },
            { label: "Customer Name", key: "customerName" },
        ];

        if (activeReport === 'production') {
            headers = [
                ...baseHeaders,
                { label: "Design Name", key: "designName" },
                { label: "Status", key: "status" },
                { label: "Quantity", key: "patchesQuantity" },
                { label: "Patch Size", key: "designSize" },
                { label: "Backing Type", key: "designBacking" },
                { label: "Urgent", key: "is_urgent" },
            ];
            data = filteredOrders.map(({ orderAmount, amountPaid, amountRemaining, salesAgent, leadSource, customerEmail, customerPhone, ...order }) => order) as Order[];
        } else if (activeReport === 'leadSource') {
            headers = [
                { label: "Lead Source", key: "leadSource" },
                { label: "Order Number", key: "orderNumber" },
                { label: "Date", key: "createdAt" },
                { label: "Total Amount", key: "orderAmount" },
                { label: "Sales Agent", key: "salesAgent" },
            ];
        } else {
            headers = [
                ...baseHeaders,
                { label: "Customer Email", key: "customerEmail" },
                { label: "Sales Agent", key: "salesAgent" },
                { label: "Status", key: "status" },
                { label: "Lead Source", key: "leadSource" },
                { label: "Total Amount", key: "orderAmount" },
                { label: "Amount Paid", key: "amountPaid" },
                { label: "Amount Remaining", key: "amountRemaining" },
                { label: "Design Name", key: "designName" },
            ];
        }

        const filename = `panda-patches-${activeReport}-report-${dateRange.startDate}-to-${dateRange.endDate}.csv`;
        return { headers, data, filename };
    };

    if (isAuthLoading || isQueryLoading) {
        return (
            <div className="flex flex-col justify-center items-center h-screen gap-4">
                <Spinner />
                <p className="text-slate-400">{isAuthLoading ? "Checking permissions..." : "Loading reports..."}</p>
            </div>
        );
    }
    
    if (isError) {
        return (
            <div className="text-center py-10 px-6 bg-red-500/10 text-red-300 rounded-lg shadow-md border border-red-500/20 m-4">
                <h3 className="text-xl font-semibold">Could not load reports</h3>
                <p className="mt-2 text-sm max-w-2xl mx-auto">{(error as Error).message}</p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-8 p-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                <div>
                    <h2 className="text-3xl font-bold text-slate-50">Reports</h2>
                    <p className="text-slate-400 mt-1">Analytics and performance insights</p>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1">
                        <button onClick={() => handleQuickFilter(7)} className="px-3 py-1.5 text-xs rounded-md hover:bg-slate-700 text-slate-300 transition-colors">This Week</button>
                        <button onClick={() => handleQuickFilter(30)} className="px-3 py-1.5 text-xs rounded-md hover:bg-slate-700 text-slate-300 transition-colors">This Month</button>
                        <button onClick={() => handleQuickFilter(60)} className="px-3 py-1.5 text-xs rounded-md hover:bg-slate-700 text-slate-300 transition-colors">Last 60 Days</button>
                    </div>
                    <div className="bg-slate-800 border border-slate-700 rounded-lg p-2">
                        <DateRangeFilter value={dateRange} onChange={handleDateChange} />
                    </div>
                    {role === UserRole.ADMIN && filteredOrders.length > 0 && ( // Only ADMIN can download CSV
                        <div>
                            <CSVLink
                                {...getCsvConfig()}
                                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 rounded-lg text-white hover:bg-emerald-700 text-sm font-semibold transition-colors"
                            >
                                <Download className="w-4 h-4" />
                                Download CSV
                            </CSVLink>
                        </div>
                    )}
                </div>
            </div>

            {/* Only show tab navigation if more than one report is available AND the user is ADMIN */}
            {(availableReports.length > 1 && role === UserRole.ADMIN) && (
                <div className="flex items-center gap-2 bg-slate-800/50 border border-slate-700/50 rounded-xl p-2 self-start">
                    {availableReports.map(report => (
                        <button 
                            key={report.key}
                            onClick={() => setActiveReport(report.key)}
                            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeReport === report.key ? 'bg-blue-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-700'}`}
                        >
                            <report.icon className="w-4 h-4" />
                            {report.label}
                        </button>
                    ))}
                </div>
            )}
            {/* For AGENT and PRODUCTION, directly render their specific report without tabs */}
            {(role === UserRole.AGENT || role === UserRole.PRODUCTION) && (
                <div className="flex items-center gap-2 bg-slate-800/50 border border-slate-700/50 rounded-xl p-2 self-start">
                    {availableReports.map(report => (
                        <button 
                            key={report.key}
                            onClick={() => setActiveReport(report.key)}
                            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeReport === report.key ? 'bg-blue-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-700'}`}
                        >
                            <report.icon className="w-4 h-4" />
                            {report.label}
                        </button>
                    ))}
                </div>
            )}

            {filteredOrders.length === 0 ? (
                <div className="text-center py-20 px-6 bg-slate-800/30 border border-slate-700/50 rounded-xl flex flex-col items-center">
                    <Package className="w-20 h-20 text-slate-600 mb-4" />
                    <h3 className="text-2xl font-semibold text-white mb-2">No Orders Found</h3>
                    <p className="text-sm text-slate-400 max-w-md">There are no orders between {dateRange.startDate} and {dateRange.endDate}.</p>
                </div>
            ) : (
                <>
                    {activeReport === 'sales' && <SalesReportComponent orders={filteredOrders} role={role} />}
                    {activeReport === 'production' && <ProductionReportComponent orders={sanitizedOrders} />}
                    {activeReport === 'leadSource' && <LeadSourceReportComponent orders={filteredOrders} />}
                    {activeReport === 'profitLoss' && <ProfitLossReportComponent dateRange={dateRange} />}
                </>
            )}
        </div>
    );
};

export default ReportsPage;