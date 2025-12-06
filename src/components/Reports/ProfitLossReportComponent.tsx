import React, { useMemo, FC, useState } from 'react';
import { Order } from '../../types';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, CartesianGrid, BarChart, Bar } from 'recharts';
import { DollarSign, TrendingUp, TrendingDown, Percent, Activity, AlertTriangle, ArrowRight, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, Variants } from 'framer-motion';
import { Link } from 'react-router-dom';
import { PATCH_TYPE_COLORS, SOURCE_COLORS } from '../../constants/index';

interface ReportComponentProps {
    orders: Order[];
}

// --- ANIMATIONS ---
const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100, damping: 15 } }
};

// --- UI COMPONENTS ---
const StatCardWrapper: FC<{ children: React.ReactNode; gradient: string; className?: string }> = ({ children, gradient, className = '' }) => (
  <motion.div variants={cardVariants} className={className}>
    <div className="group relative">
      <div className={`absolute -inset-0.5 ${gradient} rounded-2xl opacity-0 group-hover:opacity-50 blur transition duration-500`} />
      <div className="relative bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 transform group-hover:scale-[1.02] transition-all duration-300 shadow-xl group-hover:shadow-2xl">
        {children}
      </div>
    </div>
  </motion.div>
);

const SimpleStatCard: FC<{ title: string; value: number | string; subValue?: string; prefix?: string; suffix?: string; icon: React.ReactNode }> = ({ title, value, subValue, prefix = '', suffix = '', icon }) => (
  <div className="flex items-center justify-between">
    <div className="flex-1">
      <p className="text-sm font-medium text-slate-400 mb-1">{title}</p>
      <p className="text-3xl font-bold text-white">{prefix}{typeof value === 'number' ? value.toLocaleString() : value}{suffix}</p>
      {subValue && <p className="text-xs text-slate-500 mt-1 font-medium">{subValue}</p>}
    </div>
    <div className="p-3 bg-gradient-to-br from-white/10 to-white/5 rounded-xl shadow-inner">{icon}</div>
  </div>
);

// --- RICH TOOLTIP (Financials - Shows $) ---
const FinancialTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900/95 backdrop-blur-xl border border-white/10 p-4 rounded-xl shadow-2xl min-w-[200px] z-50">
        {label && <p className="text-slate-300 font-semibold mb-2 border-b border-white/10 pb-1">{label}</p>}
        {payload.map((entry: any, index: number) => (
          <div key={index} className="mb-1">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span style={{ color: entry.color }} className="font-medium">{entry.name}:</span>
              <span className="text-white font-bold">${typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}</span>
            </div>
            {entry.payload.count && (
                <p className="text-[10px] text-slate-500 text-right">across {entry.payload.count} orders</p>
            )}
          </div>
        ))}
      </div>
    );
  }
  return null;
};

// --- DONUT TOOLTIP (Counts - Shows "Orders") ---
const CountTooltip = ({ active, payload }: any) => {
    // ✅ DAY 3 FIX: Add array bounds check
    if (active && payload && payload.length > 0) {
      const data = payload[0];
      if (!data) return null;
      
      return (
        <div className="bg-slate-900/95 backdrop-blur-xl border border-white/10 p-3 rounded-xl shadow-2xl z-50">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span style={{ color: data.fill }} className="font-medium">{data.name || 'Value'}:</span>
            <span className="text-white font-bold">{data.value || 0} Orders</span>
          </div>
        </div>
      );
    }
    return null;
  };

const ProfitLossReportComponent: FC<ReportComponentProps> = ({ orders }) => {
    const [lossPage, setLossPage] = useState(1);
    const LOSS_ITEMS_PER_PAGE = 5;

    // 1. MAIN METRICS
    const reportData = useMemo(() => {
        const totalRevenue = orders.reduce((sum, order) => sum + (order.orderAmount || 0), 0);
        const totalProductionCost = orders.reduce((sum, order) => sum + (order.productionCost || 0), 0);
        const totalShippingCost = orders.reduce((sum, order) => sum + (order.shippingCost || 0), 0);
        const totalMarketingCost = orders.reduce((sum, order) => sum + (order.marketingCost || 0), 0);

        const totalCosts = totalProductionCost + totalShippingCost + totalMarketingCost;
        const netProfit = totalRevenue - totalCosts;
        const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

        return { totalRevenue, totalProductionCost, totalShippingCost, totalMarketingCost, totalCosts, netProfit, profitMargin };
    }, [orders]);

    // 2. PROFIT TREND
    const profitTrend = useMemo(() => {
        const dailyData = orders.reduce((acc, order) => {
            if (order.createdAt) {
                const date = new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                if (!acc[date]) acc[date] = { revenue: 0, costs: 0, profit: 0, count: 0 };
                acc[date].revenue += (order.orderAmount || 0);
                const orderCosts = (order.productionCost || 0) + (order.shippingCost || 0) + (order.marketingCost || 0);
                acc[date].costs += orderCosts;
                acc[date].profit += (order.orderAmount || 0) - orderCosts;
                acc[date].count += 1;
            }
            return acc;
        }, {} as Record<string, { revenue: number, costs: number, profit: number, count: number }>);
        return Object.entries(dailyData).map(([date, data]) => ({ date, ...data })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [orders]);

    // 3. COST BREAKDOWN
    const costBreakdownData = useMemo(() => {
        const prodCount = orders.filter(o => (o.productionCost || 0) > 0).length;
        const shipCount = orders.filter(o => (o.shippingCost || 0) > 0).length;
        const markCount = orders.filter(o => (o.marketingCost || 0) > 0).length;
        return [
            { name: 'Production', value: reportData.totalProductionCost, count: prodCount },
            { name: 'Shipping', value: reportData.totalShippingCost, count: shipCount },
            { name: 'Marketing', value: reportData.totalMarketingCost, count: markCount },
        ].filter(item => item.value > 0);
    }, [reportData, orders]);

    // 4. COSTS BY TYPE/SOURCE
    const productionByType = useMemo(() => {
        const stats = orders.reduce((acc, order) => {
            const type = order.patchesType || 'Unknown';
            if (!acc[type]) acc[type] = { name: type, value: 0, count: 0 };
            acc[type].value += (order.productionCost || 0);
            acc[type].count += 1;
            return acc;
        }, {} as Record<string, { name: string, value: number, count: number }>);
        return Object.values(stats).filter(s => s.value > 0).sort((a, b) => b.value - a.value);
    }, [orders]);

    const marketingBySource = useMemo(() => {
        const stats = orders.reduce((acc, order) => {
            const source = order.leadSource || 'Direct';
            if (!acc[source]) acc[source] = { name: source, value: 0, count: 0 };
            acc[source].value += (order.marketingCost || 0);
            acc[source].count += 1;
            return acc;
        }, {} as Record<string, { name: string, value: number, count: number }>);
        return Object.values(stats).filter(s => s.value > 0).sort((a, b) => b.value - a.value);
    }, [orders]);

    // 5. PROFITABILITY & LOSS ALERTS
    const { lossOrders, profitOrdersCount, lossOrdersCount } = useMemo(() => {
        const loss = orders.filter(o => (o.profit || 0) < 0);
        const profit = orders.filter(o => (o.profit || 0) >= 0);
        // Sort by biggest loss
        const sortedLosses = [...loss].sort((a, b) => (a.profit || 0) - (b.profit || 0));
        return { lossOrders: sortedLosses, profitOrdersCount: profit.length, lossOrdersCount: loss.length };
    }, [orders]);

    // Pagination Logic
    const paginatedLossOrders = useMemo(() => {
        return lossOrders.slice((lossPage - 1) * LOSS_ITEMS_PER_PAGE, lossPage * LOSS_ITEMS_PER_PAGE);
    }, [lossOrders, lossPage]);

    const totalLossPages = Math.ceil(lossOrders.length / LOSS_ITEMS_PER_PAGE);

    const profitabilityData = [
        { name: 'Profitable', value: profitOrdersCount },
        { name: 'Loss Making', value: lossOrdersCount }
    ];
    const PROFIT_COLORS = ['#10B981', '#EF4444'];
    const COLORS = ['#3B82F6', '#F59E0B', '#EF4444'];

    return (
        <div className="space-y-6">
            {/* STAT CARDS */}
            <motion.div initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCardWrapper gradient="bg-gradient-to-r from-blue-500 to-cyan-500">
                    <SimpleStatCard title="Total Revenue" value={reportData.totalRevenue} subValue={`Across ${orders.length} orders`} prefix="$" icon={<DollarSign className="w-6 h-6 text-cyan-400" />} />
                </StatCardWrapper>
                <StatCardWrapper gradient="bg-gradient-to-r from-brand-orange to-red-600">
                    <SimpleStatCard title="Total Costs" value={reportData.totalCosts} subValue="Production, Ship, Ads" prefix="$" icon={<TrendingDown className="w-6 h-6 text-red-400" />} />
                </StatCardWrapper>
                <StatCardWrapper gradient="bg-gradient-to-r from-green-500 to-emerald-500">
                    <SimpleStatCard title="Net Profit" value={reportData.netProfit} subValue="Realized Earnings" prefix="$" icon={<TrendingUp className="w-6 h-6 text-green-400" />} />
                </StatCardWrapper>
                <StatCardWrapper gradient="bg-gradient-to-r from-purple-500 to-pink-500">
                    <SimpleStatCard title="Profit Margin" value={reportData.profitMargin.toFixed(1)} subValue="Overall Efficiency" suffix="%" icon={<Percent className="w-6 h-6 text-purple-400" />} />
                </StatCardWrapper>
            </motion.div>

            {/* MAIN CHARTS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
                    <h4 className="text-lg font-semibold text-white mb-6">Financial Performance</h4>
                    <ResponsiveContainer width="100%" height={350}>
                        <AreaChart data={profitTrend}>
                            <defs>
                                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/><stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/></linearGradient>
                                <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/><stop offset="95%" stopColor="#10B981" stopOpacity={0}/></linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                            <XAxis dataKey="date" stroke="#94A3B8" style={{ fontSize: '12px' }} />
                            <YAxis stroke="#94A3B8" style={{ fontSize: '12px' }} tickFormatter={(v) => `$${v/1000}k`} />
                            <Tooltip content={<FinancialTooltip />} />
                            <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px' }} />
                            <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#3B82F6" fill="url(#colorRevenue)" strokeWidth={3} />
                            <Area type="monotone" dataKey="profit" name="Net Profit" stroke="#10B981" fill="url(#colorProfit)" strokeWidth={3} />
                            <Area type="monotone" dataKey="costs" name="Costs" stroke="#EF4444" fill="transparent" strokeWidth={2} strokeDasharray="5 5" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
                <div className="lg:col-span-1 bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col">
                    <h4 className="text-lg font-semibold text-white mb-2">Cost Breakdown</h4>
                    <div className="flex-grow flex items-center justify-center">
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie data={costBreakdownData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} cornerRadius={5} stroke="none">
                                    {costBreakdownData.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                                </Pie>
                                <Tooltip content={<FinancialTooltip />} />
                                <Legend layout="horizontal" verticalAlign="bottom" align="center" iconSize={10} wrapperStyle={{ fontSize: '12px', color: '#cbd5e1' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* COST INTELLIGENCE */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center gap-2 mb-4"><Activity className="w-5 h-5 text-blue-400" /><h4 className="text-lg font-semibold text-white">Production Cost Analysis</h4></div>
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={productionByType} layout="vertical" margin={{ left: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} horizontal={false} />
                            <XAxis type="number" stroke="#94A3B8" hide />
                            <YAxis type="category" dataKey="name" stroke="#cbd5e1" width={100} style={{ fontSize: '12px', fontWeight: 500 }} />
                            <Tooltip content={<FinancialTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                            <Bar dataKey="value" name="Cost" radius={[0, 4, 4, 0]} barSize={24}>
                                {productionByType.map((entry, index) => (<Cell key={`cell-${index}`} fill={PATCH_TYPE_COLORS[entry.name] || '#64748B'} />))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center gap-2 mb-4"><Activity className="w-5 h-5 text-red-400" /><h4 className="text-lg font-semibold text-white">Ad Spend by Platform</h4></div>
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={marketingBySource} layout="vertical" margin={{ left: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} horizontal={false} />
                            <XAxis type="number" stroke="#94A3B8" hide />
                            <YAxis type="category" dataKey="name" stroke="#cbd5e1" width={100} style={{ fontSize: '12px', fontWeight: 500 }} />
                            <Tooltip content={<FinancialTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                            <Bar dataKey="value" name="Cost" radius={[0, 4, 4, 0]} barSize={24}>
                                {marketingBySource.map((entry, index) => (<Cell key={`cell-${index}`} fill={SOURCE_COLORS[entry.name] || '#64748B'} />))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* PROFITABILITY ANALYSIS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* LEFT: Profit Ratio Donut (Side-by-Side Layout) */}
                <div className="lg:col-span-1 bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col">
                    <h4 className="text-lg font-semibold text-white mb-4">Order Profitability</h4>
                    
                    <div className="flex items-center h-full">
                        {/* CHART (Left) */}
                        <div className="w-1/2 h-[200px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie 
                                        data={profitabilityData} 
                                        dataKey="value" 
                                        nameKey="name" 
                                        cx="50%" cy="50%" 
                                        innerRadius={50} 
                                        outerRadius={70} 
                                        paddingAngle={5}
                                        cornerRadius={4}
                                        stroke="none"
                                    >
                                        {profitabilityData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={PROFIT_COLORS[index]} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<CountTooltip />} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        {/* STATS (Right) */}
                        <div className="w-1/2 pl-2 space-y-4">
                            {/* Profitable */}
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                    <span className="text-xs text-slate-400 uppercase font-bold">Profitable</span>
                                </div>
                                <p className="text-2xl font-bold text-white">
                                    {orders.length > 0 ? ((profitOrdersCount / orders.length) * 100).toFixed(0) : 0}%
                                </p>
                                <p className="text-xs text-emerald-400 font-medium">{profitOrdersCount} Orders</p>
                            </div>

                            {/* Loss Making */}
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                    <span className="text-xs text-slate-400 uppercase font-bold">Loss</span>
                                </div>
                                <p className="text-2xl font-bold text-white">
                                    {orders.length > 0 ? ((lossOrdersCount / orders.length) * 100).toFixed(0) : 0}%
                                </p>
                                <p className="text-xs text-red-400 font-medium">{lossOrdersCount} Orders</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT: Top Loss Alerts Table (Paginated & Clickable) */}
                <div className="lg:col-span-2 bg-slate-900/40 backdrop-blur-xl border border-red-500/30 rounded-2xl p-6 shadow-xl flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-red-500/10 rounded-lg">
                                <AlertTriangle className="w-5 h-5 text-red-500 animate-pulse" />
                            </div>
                            <div>
                                <h4 className="text-lg font-bold text-white">Loss Alerts</h4>
                                <p className="text-xs text-red-300">{lossOrders.length} orders have negative profit margins.</p>
                            </div>
                        </div>
                        {/* PAGINATION CONTROLS */}
                        {totalLossPages > 1 && (
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => setLossPage(p => Math.max(1, p - 1))}
                                    disabled={lossPage === 1}
                                    className="p-1.5 rounded bg-slate-800 text-slate-300 disabled:opacity-50 hover:text-white transition-colors"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <span className="text-xs text-slate-400">
                                    {lossPage} / {totalLossPages}
                                </span>
                                <button 
                                    onClick={() => setLossPage(p => Math.min(totalLossPages, p + 1))}
                                    disabled={lossPage === totalLossPages}
                                    className="p-1.5 rounded bg-slate-800 text-slate-300 disabled:opacity-50 hover:text-white transition-colors"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="overflow-x-auto flex-grow">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-white/10 text-slate-400 text-xs uppercase tracking-wider">
                                    <th className="p-3">Order</th>
                                    <th className="p-3">Agent</th>
                                    <th className="p-3 text-right">Revenue</th>
                                    <th className="p-3 text-right">Total Cost</th>
                                    <th className="p-3 text-right">Net Loss</th>
                                    <th className="p-3 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 text-sm">
                                {paginatedLossOrders.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-slate-500 flex flex-col items-center justify-center">
                                            <CheckCircle className="w-8 h-8 text-green-500 mb-2" />
                                            <span>Great job! No loss-making orders found.</span>
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedLossOrders.map(order => {
                                        const totalCost = (order.productionCost || 0) + (order.shippingCost || 0) + (order.marketingCost || 0);
                                        return (
                                            <tr key={order.id} className="hover:bg-red-500/5 transition-colors group">
                                                <td className="p-3">
                                                    <Link 
                                                        to={`/order/${order.orderNumber}`} 
                                                        className="text-brand-orange font-bold hover:text-orange-400 transition-colors underline-offset-4 hover:underline"
                                                    >
                                                        {order.orderNumber}
                                                    </Link>
                                                    <div className="text-slate-500 text-xs mt-0.5">{order.customerName}</div>
                                                </td>
                                                <td className="p-3 text-slate-300">{order.salesAgent}</td>
                                                <td className="p-3 text-right text-slate-300">${order.orderAmount.toLocaleString()}</td>
                                                <td className="p-3 text-right text-slate-300">${totalCost.toLocaleString()}</td>
                                                <td className="p-3 text-right font-bold text-red-500">
                                                    -${Math.abs(order.profit).toLocaleString()}
                                                </td>
                                                <td className="p-3 text-right">
                                                    <Link to={`/order/${order.orderNumber}`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-orange hover:text-white transition-colors border border-brand-orange/30 px-3 py-1.5 rounded-lg hover:bg-brand-orange/10">
                                                        View <ArrowRight className="w-3 h-3" />
                                                    </Link>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfitLossReportComponent;