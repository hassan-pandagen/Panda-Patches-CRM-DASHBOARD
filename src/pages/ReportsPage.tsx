// src/pages/ReportsPage.tsx

import React, { useState, useCallback, useMemo, FC } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { Order, UserRole } from '../types/index';
import Spinner from '../components/ui/Spinner';
import DateRangeFilter, { DateRange, getDefaultRange } from '../components/ui/DateRangeFilter';
import { fetchOrdersBetween } from '../services/orderService';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from 'recharts';
import StatCard from '../components/ui/StatCard';
import { DollarSign, Package, TrendingUp, CheckCircle, Zap, AlertCircle, Award } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getStatusInfo } from '../constants';

// --- Report Components (Your full UI code is preserved here and is correct) ---

interface ReportComponentProps {
    orders: Order[];
}

const SalesReportComponent: FC<ReportComponentProps> = ({ orders }) => {
    const navigate = useNavigate();
    const totalRevenue = useMemo(() => orders.reduce((sum, order) => sum + (order.orderAmount || 0), 0), [orders]);
    const totalOrders = orders.length;
    const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const completedOrdersCount = useMemo(() => orders.filter(o => o.status === 'COMPLETED').length, [orders]);
    const totalCollected = useMemo(() => orders.reduce((sum, order) => sum + (order.amountPaid || 0), 0), [orders]);

    const salesByAgent = useMemo(() => {
        const agentSales = orders.reduce((acc, order) => {
            const agentName = order.salesAgent || 'Unassigned';
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
                <StatCard 
                    title="Total Revenue" 
                    value={`$${totalRevenue.toLocaleString()}`} 
                    icon={<DollarSign className="w-6 h-6" />} 
                    color="primary" 
                />
                <StatCard 
                    title="Total Orders" 
                    value={totalOrders.toString()} 
                    icon={<Package className="w-6 h-6" />} 
                    color="info" 
                    onClick={() => navigate('/orders')}
                    className="cursor-pointer hover:border-blue-400/50"
                />
                <StatCard title="Avg. Order Value" value={`$${aov.toFixed(2)}`} icon={<TrendingUp className="w-6 h-6" />} color="warning"  />
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
                                <tr key={`${agent.name}-${index}`} className="hover:bg-slate-700/30">
                                    <td className="px-4 py-3 font-medium">#{index + 1}</td>
                                    <td className="px-4 py-3 font-semibold text-white">{agent.name}</td>
                                    <td className="px-4 py-3">{agent.orders}</td>
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
    const urgentCount = useMemo(() => orders.filter(o => o.is_urgent && o.status !== 'COMPLETED' && o.status !== 'SHIPPED').length, [orders]);
    const redoCount = useMemo(() => orders.filter(o => !!o.redoNotes).length, [orders]);
    const qualityScore = totalOrders > 0 ? ((totalOrders - redoCount) / totalOrders) * 100 : 100;

    const productionByType = useMemo(() => {
        const typeCounts = orders.reduce((acc, order) => {
            const type = order.patchesType || 'Unknown'; acc[type] = (acc[type] || 0) + 1; return acc;
        }, {} as Record<string, number>);
        return Object.entries(typeCounts).map(([name, value]) => ({ name, value }));
    }, [orders]);

    const statusDistribution = useMemo(() => {
        const statusCounts = orders.reduce((acc, order) => {
            const statusInfo = getStatusInfo(order.status);
            if (statusInfo) {
                const statusLabel = statusInfo.label;
                acc[statusLabel] = (acc[statusLabel] || 0) + 1;
            }
            return acc;
        }, {} as Record<string, number>);
        return Object.entries(statusCounts).map(([name, count]) => ({ name, count }));
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
                            <XAxis dataKey="name" stroke="#94A3B8" tick={{ fill: '#CBD5E1', fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
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

const ReportsPage: React.FC = () => {
    // --- FINAL FIX #1: Destructure `role` and rename `isLoading` to avoid conflicts ---
    const { user, role, isLoading: isAuthLoading } = useAuth();
    
    const [dateRange, setDateRange] = useState<DateRange>(getDefaultRange);

    const handleDateChange = useCallback((newDateRange: DateRange) => { setDateRange(newDateRange); }, []);
    const handleQuickFilter = useCallback((days: number) => {
        const endDate = new Date();
        const startDate = new Date();
        // FIX: Ensure start date is set to the beginning of the day for consistency
        startDate.setDate(endDate.getDate() - (days - 1));
        startDate.setHours(0, 0, 0, 0);
        setDateRange({ 
            startDate: startDate.toISOString().split('T')[0], 
            endDate: endDate.toISOString().split('T')[0] 
        });
    }, []);

    // --- FINAL FIX #2: Rename `isLoading` from useQuery to distinguish it from auth loading ---
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

    // --- FINAL FIX #3: Create a robust loading check for both auth and data fetching ---
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
                    <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg p-1">
                        <button onClick={() => handleQuickFilter(7)} className="px-3 py-1.5 text-xs rounded-md hover:bg-slate-700 text-slate-300 transition-colors">This Week</button>
                        <button onClick={() => handleQuickFilter(30)} className="px-3 py-1.5 text-xs rounded-md hover:bg-slate-700 text-slate-300 transition-colors">This Month</button>
                        <button onClick={() => handleQuickFilter(60)} className="px-3 py-1.5 text-xs rounded-md hover:bg-slate-700 text-slate-300 transition-colors">Last 60 Days</button>
                    </div>
                    <div className="bg-slate-800 border border-slate-700 rounded-lg p-2">
                        <DateRangeFilter value={dateRange} onChange={handleDateChange} />
                    </div>
                </div>
            </div>
            {filteredOrders.length === 0 ? (
                <div className="text-center py-20 px-6 bg-slate-800/30 border border-slate-700/50 rounded-xl flex flex-col items-center">
                    <Package className="w-20 h-20 text-slate-600 mb-4" />
                    <h3 className="text-2xl font-semibold text-white mb-2">No Orders Found</h3>
                    <p className="text-sm text-slate-400 max-w-md">There are no orders between {dateRange.startDate} and {dateRange.endDate}.</p>
                </div>
            ) : (
                <>
                    {/* --- FINAL FIX #4: Check the top-level `role` variable, not `user.role` --- */}
                    {role === UserRole.ADMIN && (<div className="space-y-8"><SalesReportComponent orders={filteredOrders} /><ProductionReportComponent orders={filteredOrders} /></div>)}
                    {role === UserRole.AGENT && <SalesReportComponent orders={filteredOrders} />}
                    {role === UserRole.PRODUCTION && <ProductionReportComponent orders={filteredOrders} />}
                </>
            )}
        </div>
    );
};

export default ReportsPage;