import React, { useState, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import { Order, UserRole } from '../types/index';
import Spinner from '../components/ui/Spinner';
import { useAuth } from '../contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from 'recharts';
import DateRangeFilter, { DateRange } from '../components/ui/DateRangeFilter';
import { getStatusInfo } from '../constants';
import StatCard from '../components/ui/StatCard';
import { DollarSign, Package, TrendingUp, CheckCircle, Zap, AlertCircle, Award } from 'lucide-react';

const fetchAllOrdersForReport = async (dateRange: DateRange): Promise<Order[]> => {
  let query = supabase.from('orders').select(`
      id, status, instructions, packing, courier, created_by,
      orderNumber:order_number, customerName:customer_name, customerEmail:customer_email,
      customerPhone:customer_phone, shippingAddress:shipping_address, designName:design_name,
      designSize:design_size, designBacking:design_backing, patchesType:patches_type,
      patchesQuantity:patches_quantity, revisionNotes:revision_notes, customerAttachmentURLs:customer_attachment_urls,
      mockupURLs:mockup_urls, redoNotes:redo_notes, redoAttachments:redo_attachments,
      trackingNumber:tracking_number, orderAmount:order_amount, amountPaid:amount_paid,
      amountRemaining:amount_remaining, salesAgent:sales_agent, createdAt:created_at, updatedAt:updated_at, is_urgent, is_urgent_approved
  `);

  if (dateRange.startDate) {
    query = query.gte('created_at', dateRange.startDate);
  }
  if (dateRange.endDate) {
    query = query.lte('created_at', dateRange.endDate);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data as Order[];
};

// --- Report Components ---

const SalesReportComponent: React.FC<{ orders: Order[], dateRange: DateRange }> = ({ orders, dateRange }) => {
    const totalRevenue = useMemo(() => orders.reduce((sum, order) => sum + order.orderAmount, 0), [orders]);
    const totalOrders = orders.length;
    const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const totalCollected = useMemo(() => orders.reduce((sum, order) => sum + order.amountPaid, 0), [orders]);

    const salesByAgent = useMemo(() => {
        const agentSales = orders.reduce((acc, order) => {
            const agentName = order.salesAgent || 'Unassigned';
            if (!acc[agentName]) {
                acc[agentName] = { revenue: 0, orders: 0 };
            }
            acc[agentName].revenue += order.orderAmount;
            acc[agentName].orders += 1;
            return acc;
        }, {} as Record<string, { revenue: number, orders: number }>);

        return Object.entries(agentSales).map(([name, data]) => ({ 
            name, 
            ...data,
            aov: data.orders > 0 ? data.revenue / data.orders : 0,
            percentOfTotal: totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0,
        })).sort((a, b) => b.revenue - a.revenue);
    }, [orders, totalRevenue]);

    const revenueTrend = useMemo(() => {
        const dailyRevenue = orders.reduce((acc, order) => {
            const date = new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            acc[date] = (acc[date] || 0) + order.orderAmount;
            return acc;
        }, {} as Record<string, number>);
        
        return Object.entries(dailyRevenue)
            .map(([date, revenue]) => ({ date, revenue }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [orders]);

    return (
        <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Total Revenue" value={`$${totalRevenue.toLocaleString()}`} icon={<DollarSign className="w-6 h-6" />} color="primary" />
                <StatCard title="Total Orders" value={totalOrders.toLocaleString()} icon={<Package className="w-6 h-6" />} color="info" />
                <StatCard title="Avg. Order Value" value={`$${aov.toFixed(2)}`} icon={<TrendingUp className="w-6 h-6" />} color="warning" />
                <StatCard title="Amount Collected" value={`$${totalCollected.toLocaleString()}`} icon={<CheckCircle className="w-6 h-6" />} color="success" />
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-3 bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
                    <h4 className="text-lg font-semibold text-white mb-4">Revenue Trend</h4>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={revenueTrend}>
                            <defs>
                                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
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
                            <defs>
                                <linearGradient id="agentBarGradient" x1="0" y1="0" x2="1" y2="0">
                                    <stop offset="0%" stopColor="#06B6D4" stopOpacity={0.8} />
                                    <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.8} />
                                </linearGradient>
                            </defs>
                            <XAxis type="number" hide />
                            <YAxis type="category" dataKey="name" stroke="#94A3B8" width={80} tick={{ fill: '#F8FAFC', fontSize: 12 }} axisLine={false} tickLine={false} />
                            <Tooltip cursor={{ fill: 'rgba(6, 182, 212, 0.1)' }} contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '0.75rem' }} formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']} />
                            <Bar dataKey="revenue" fill="url(#agentBarGradient)" radius={[0, 4, 4, 0]} background={{ fill: 'rgba(255,255,255,0.05)', radius: 4 }} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Agent Performance Table */}
            <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
                <h4 className="text-lg font-semibold text-white mb-4">Top Performing Agents</h4>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-slate-300">
                        <thead className="text-xs text-slate-400 uppercase bg-slate-800/50">
                            <tr>
                                <th className="px-4 py-3">Rank</th>
                                <th className="px-4 py-3">Agent</th>
                                <th className="px-4 py-3">Orders</th>
                                <th className="px-4 py-3 text-right">Revenue</th>
                                <th className="px-4 py-3 text-right">% of Total</th>
                                <th className="px-4 py-3 text-right">Avg. Value</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50">
                            {salesByAgent.map((agent, index) => (
                                <tr key={agent.name} className="hover:bg-slate-700/30">
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

const ProductionReportComponent: React.FC<{ orders: Order[] }> = ({ orders }) => {
    const inProductionCount = useMemo(() => orders.filter(o => o.status === 'IN_PRODUCTION').length, [orders]);
    const totalOrders = orders.length;
    const urgentCount = useMemo(() => orders.filter(o => o.is_urgent && o.status !== 'COMPLETED' && o.status !== 'SHIPPED').length, [orders]);
    const redoCount = useMemo(() => orders.filter(o => !!o.redoNotes).length, [orders]);
    const qualityScore = totalOrders > 0 ? ((totalOrders - redoCount) / totalOrders) * 100 : 100;

    const productionByType = useMemo(() => {
      const typeCounts = orders.reduce((acc, order) => {
        const type = order.patchesType || 'Unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      return Object.entries(typeCounts).map(([name, value]) => ({ name, value }));
    }, [orders]);

    const statusDistribution = useMemo(() => {
      const statusCounts = orders.reduce((acc, order) => {
        const statusLabel = getStatusInfo(order.status).label;
        acc[statusLabel] = (acc[statusLabel] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      return Object.entries(statusCounts).map(([name, count]) => ({ name, count }));
    }, [orders]);

    const COLORS = ['#3B82F6', '#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444'];

    return (
        <div className="space-y-6">
            <h3 className="text-2xl font-semibold text-slate-100">Production Overview</h3>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard title="Orders In Production" value={inProductionCount} icon={<Zap className="w-6 h-6" />} color="primary" />
                <StatCard title="Urgent Queue" value={urgentCount} icon={<AlertCircle className="w-6 h-6" />} color="warning" />
                <StatCard title="Redo/Revision Rate" value={`${((redoCount / totalOrders) * 100 || 0).toFixed(1)}%`} icon={<AlertCircle className="w-6 h-6" />} color="error" />
                <StatCard title="Quality Score" value={`${qualityScore.toFixed(1)}%`} icon={<Award className="w-6 h-6" />} color="success" />
            </div>
            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
                    <h4 className="text-lg font-semibold text-white mb-4">Production by Patch Type</h4>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie data={productionByType} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} fill="#8884d8" label>
                                {productionByType.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip 
                                contentStyle={{ 
                                    backgroundColor: '#1E293B', 
                                    border: '1px solid #334155', 
                                    borderRadius: '0.75rem' 
                                }} 
                                itemStyle={{ color: '#FFFFFF' }} />
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
    const { user } = useAuth();
    const [dateRange, setDateRange] = useState<DateRange>({ startDate: null, endDate: null });

    // FIX: Wrap the handler in useCallback to stabilize its reference across re-renders.
    const handleDateChange = useCallback((newDateRange: DateRange) => {
        setDateRange(newDateRange);
    }, []);

    const { data: filteredOrders = [], isLoading, error } = useQuery({
        queryKey: ['allOrdersReport', dateRange],
        queryFn: () => fetchAllOrdersForReport(dateRange),
    });

    if (isLoading) {
        return <div className="flex justify-center items-center h-64"><Spinner /></div>;
    }
    
    if (error) {
        return <div className="text-center py-10 px-6 bg-red-500/10 text-red-300 rounded-lg shadow-md border border-red-500/20">
            <h3 className="text-xl font-semibold">Could not load reports</h3>
            <p className="mt-2 text-sm max-w-2xl mx-auto">{error.message}</p>
        </div>;
    }

    return (
        <div className="max-w-7xl mx-auto space-y-8 p-4">
            <div className="flex justify-between items-center flex-wrap gap-y-4">
                <h2 className="text-3xl font-bold text-slate-50">Reports</h2>
                <DateRangeFilter onChange={handleDateChange} />
            </div>

            {/* CEO / Admin View */}
            {user?.role === UserRole.ADMIN && (
                <div className="space-y-8">
                    <SalesReportComponent orders={filteredOrders} dateRange={dateRange} />
                    <ProductionReportComponent orders={filteredOrders} />
                </div>
            )}
            {user?.role === UserRole.AGENT && <SalesReportComponent orders={filteredOrders} dateRange={dateRange} />}
            {user?.role === UserRole.PRODUCTION && <ProductionReportComponent orders={filteredOrders} />}

        </div>
    );
};

export default ReportsPage;
