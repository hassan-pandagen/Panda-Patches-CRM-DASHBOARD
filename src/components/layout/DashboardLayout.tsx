// src/components/layout/DashboardLayout.tsx

import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Spinner from '../ui/Spinner';
// FIX: Import 'getDefaultRange' to set the initial state cleanly
import DateRangeFilter, { DateRange, getDefaultRange } from '../ui/DateRangeFilter';
import StatCard from '../ui/StatCard'; // This path is correct
import ProductionProgress from '../dashboard/ProductionProgress'; // This path is correct
import { useDashboardMetrics } from '../../hooks/useDashboardMetrics'; // This path is correct
import { fetchOrdersBetween } from '../../services/orderService'; // This path is correct
import { Order, OrderStatus } from '../../types'; // This path is correct

// This color map can stay as it is
const STATUS_COLORS: Record<OrderStatus, string> = {
    [OrderStatus.NEW_ORDER]: "bg-sky-500/10",
    [OrderStatus.PENDING]: "bg-amber-500/10",
    [OrderStatus.IN_PROGRESS]: "bg-blue-500/10",
    [OrderStatus.AWAITING_CUSTOMER_APPROVAL]: "bg-purple-500/10",
    [OrderStatus.REVISION_REQUESTED]: "bg-yellow-500/10",
    [OrderStatus.APPROVED]: "bg-teal-500/10",
    [OrderStatus.IN_PRODUCTION]: "bg-indigo-500/10",
    [OrderStatus.COMPLETED]: "bg-emerald-500/10",
    [OrderStatus.SHIPPED]: "bg-green-500/10",
    [OrderStatus.DELIVERED]: "bg-lime-500/10",
    [OrderStatus.SEND_FEEDBACK_EMAIL]: "bg-pink-500/10",
    [OrderStatus.CANCELLED]: "bg-rose-500/10",
    [OrderStatus.DELAYED]: "bg-orange-500/10",
    [OrderStatus.REFUNDED]: "bg-gray-500/10",
};


const DashboardLayout: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // FIX: Use the imported function to set the initial state
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultRange());
  const [error, setError] = useState<string | null>(null);

  const metrics = useDashboardMetrics(orders);

  useEffect(() => {
    // This function will now re-run whenever 'dateRange' changes
    const loadOrders = async () => {
      setIsLoading(true); // Set loading to true at the start of the fetch
      setError(null);

      try {
        const start = new Date(`${dateRange.startDate}T00:00:00Z`).toISOString();
        const end = new Date(`${dateRange.endDate}T23:59:59Z`).toISOString();
        const data: Order[] = await fetchOrdersBetween(start, end);
        setOrders(data);
      } catch (err) {
        console.error(err);
        setError('Failed to fetch orders');
      } finally {
        setIsLoading(false); // Set loading to false at the end
      }
    };
    
    loadOrders();
  }, [dateRange]); // CRITICAL FIX: Added 'dateRange' to the dependency array

  if (isLoading)
    return (
      <div className="flex justify-center items-center h-full">
        <Spinner />
      </div>
    );

  if (error)
    return (
      <div className="p-6 text-red-400 flex items-center gap-2">
        <AlertTriangle className="w-5 h-5" /> {error}
      </div>
    );
  
  // This calculation logic is good
  const totalRevenue = orders.reduce((acc, o) => acc + (o.orderAmount || 0), 0);
  const totalOrders = orders.length;
  const completedOrders = orders.filter(o => o.status === OrderStatus.COMPLETED).length;
  const pendingOrders = orders.filter(o => o.status === OrderStatus.PENDING).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        {/* FIX: Pass the 'value' prop to make it a controlled component */}
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Orders" value={totalOrders} />
        <StatCard title="Completed Orders" value={completedOrders} />
        <StatCard title="Pending Orders" value={pendingOrders} />
        <StatCard title="Total Revenue" value={`$${totalRevenue.toLocaleString()}`} />
        <StatCard title="In Production" value={metrics.inProductionOrders} />
      </div>

      <ProductionProgress orders={orders} />

      <div className="bg-slate-800 rounded-lg p-4 mt-6 shadow-lg">
        <h2 className="text-lg font-semibold mb-3 text-slate-200">Status Overview</h2>
        {/* ... Status overview JSX ... */}
      </div>
    </div>
  );
};

export default DashboardLayout;