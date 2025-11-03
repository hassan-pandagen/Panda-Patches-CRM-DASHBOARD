import React, { useState, useMemo, useCallback } from 'react';
import { Order } from '../types/index';
import Spinner from '../components/ui/Spinner';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
import DateRangeFilter, { DateRange } from "../components/ui/DateRangeFilter";
import { Package, CheckCircle, AlertTriangle, DollarSign, Clock } from 'lucide-react';
import StatCard from '../components/ui/StatCard';
import ProductionProgress from './ProductionProgress'; // Assuming this is a valid path
import RecentOrdersTable from './RecentOrdersTable'; // Assuming this is a valid path
import { useRealtimeOrders } from "../hooks";
import { fetchOrdersBetween } from "./fetchOrdersBetween"; // Corrected path

export default function CEODashboard() {
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    };
  });

  const handleDateChange = useCallback((newDateRange: DateRange) => {
    setDateRange(newDateRange);
  }, []);

  const { data: orders = [], isLoading, error } = useQuery({
    queryKey: ['orders', dateRange.startDate, dateRange.endDate],
    queryFn: () => fetchOrdersBetween(
        new Date(`${dateRange.startDate}T00:00:00.000Z`).toISOString(),
        new Date(`${dateRange.endDate}T23:59:59.999Z`).toISOString()
    ),
    enabled: !!dateRange.startDate && !!dateRange.endDate,
    staleTime: 0, // ← Change this from 3 minutes to 0
    gcTime: 1000 * 60 * 5,
    refetchOnWindowFocus: true, // ← Change this from false to true
    placeholderData: keepPreviousData,
  });

  useRealtimeOrders();

  // Derived metrics
  const totalRevenue = useMemo(() => orders.reduce((sum: number, o: Order) => sum + (Number(o.orderAmount) || 0), 0), [orders]);
  const totalOrders = orders.length;
  const totalCollected = useMemo(() => orders.reduce((sum: number, order: Order) => sum + order.amountPaid, 0), [orders]);
  const pendingAmount = useMemo(() => orders.reduce((sum: number, order: Order) => sum + order.amountRemaining, 0), [orders]);
  const urgentOrders = useMemo(() => orders.filter((order: Order) => order.is_urgent).length, [orders]);
  const inProductionOrders = useMemo(() => orders.filter((order: Order) => order.status === 'IN_PRODUCTION').length, [orders]);

  // Sales by Agent data
  const salesByAgent = useMemo(() => {
    const agentSales = (orders as Order[]).reduce((acc: Record<string, number>, order: Order) => {
      const agent = order.salesAgent || 'Unassigned';
      acc[agent] = (acc[agent] || 0) + order.orderAmount;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(agentSales)
      .map(([name, revenue]) => ({ 
        name: name.split('@')[0], // Use username part only
        revenue,
        orders: (orders as Order[]).filter((o: Order) => o.salesAgent === name).length
      }))
      .sort((a, b) => (b.revenue || 0) - (a.revenue || 0));
  }, [orders]);

  // Revenue trend data
  const revenueTrend = useMemo(() => {
    const dailyRevenue = (orders as Order[]).reduce((acc: Record<string, number>, order: Order) => {
      const date = new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      acc[date] = (acc[date] || 0) + order.orderAmount;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(dailyRevenue)
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-7); // Last 7 days
  }, [orders]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Spinner />
          <p className="text-slate-400 mt-4 text-lg">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-rose-400" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">Unable to Load Dashboard</h3>
          <p className="text-slate-400 mb-6">{(error as Error).message}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-white">CEO Dashboard</h1>
            <p className="text-slate-400 mt-2">Real-time business overview and performance metrics</p>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-2">
            <DateRangeFilter onChange={handleDateChange} />
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard 
            title="Total Revenue" 
            value={`$${totalRevenue.toLocaleString()}`}
            icon={<DollarSign className="w-6 h-6" />}
            color="primary"
          />
          <StatCard 
            title="Total Orders" 
            value={totalOrders}
            subtitle={`${urgentOrders} urgent`}
            icon={<Package className="w-6 h-6" />}
            color="info"
          />
          <StatCard 
            title="Amount Collected" 
            value={`$${totalCollected.toLocaleString()}`}
            icon={<CheckCircle className="w-6 h-6" />}
            color="success"
          />
          <StatCard 
            title="Pending Amount" 
            value={`$${pendingAmount.toLocaleString()}`}
            icon={<Clock className="w-6 h-6" />}
            color="warning"
          />
        </div>

        {/* Charts and Production Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Sales Performance */}
          <div className="xl:col-span-2 space-y-6">
            {/* Revenue Trend */}
            <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Revenue Trend</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={revenueTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#94a3b8"
                    tick={{ fill: '#cbd5e1', fontSize: 12 }}
                  />
                  <YAxis 
                    stroke="#94a3b8"
                    tickFormatter={(value) => `$${value}`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1E293B',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="#BB82F2" 
                    strokeWidth={2}
                    dot={{ fill: '#BB82F2', r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Sales by Agent - Improved Design */}
            <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Top Performing Agents</h3>
                <span className="text-slate-400 text-sm">By revenue</span>
              </div>
              <div className="space-y-4">
                {salesByAgent.slice(0, 5).map((agent, index) => (
                  <div key={agent.name} className="flex items-center justify-between p-3 bg-slate-700/20 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm
                        ${index === 0 ? 'bg-amber-500' : 
                          index === 1 ? 'bg-slate-500' : 
                          index === 2 ? 'bg-amber-700' : 'bg-slate-600'}`}>
                        {index + 1}
                      </div>
                      <div>
                        <p className="text-white font-medium">{agent.name}</p>
                        <p className="text-slate-400 text-xs">{agent.orders} orders</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-bold">${agent.revenue.toLocaleString()}</p>
                      <p className="text-blue-400 text-xs">
                        {((agent.revenue / totalRevenue) * 100).toFixed(1)}% of total
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Production Sidebar */}
          <div className="space-y-6">
            <ProductionProgress orders={orders} />
            <RecentOrdersTable orders={orders} />
            
            {/* Quick Stats */}
            <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Production Quick Stats</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">In Production</span>
                  <span className="text-white font-semibold">{inProductionOrders}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Urgent Orders</span>
                  <span className="text-amber-400 font-semibold">{urgentOrders}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Ready to Ship</span>
                  <span className="text-emerald-400 font-semibold">
                    {orders.filter((o: Order) => o.status === 'COMPLETED').length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
    </div>
  );
}