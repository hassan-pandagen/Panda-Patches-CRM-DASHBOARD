// src/components/layout/DashboardLayout.tsx

import React, { useEffect, useState } from 'react';
import { AlertTriangle, ShoppingCart, CheckCircle, Clock, DollarSign } from 'lucide-react';
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
    [OrderStatus.AWAITING_APPROVAL]: "bg-purple-500/10",
    [OrderStatus.REVISION_REQUESTED]: "bg-yellow-500/10",
    [OrderStatus.APPROVED]: "bg-teal-500/10",
    [OrderStatus.IN_PRODUCTION]: "bg-indigo-500/10",
    [OrderStatus.COMPLETED]: "bg-emerald-500/10",
    [OrderStatus.SHIPPED]: "bg-green-500/10",
    [OrderStatus.DELIVERED]: "bg-lime-500/10",
    [OrderStatus.CANCELLED]: "bg-rose-500/10",
    [OrderStatus.REFUNDED]: "bg-gray-500/10",
};


const DashboardLayout: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // FIX: Use the imported function to set the initial state
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultRange());
  const [error, setError] = useState<string | null>(null);

  const metrics = useDashboardMetrics(orders);

  // Calculate the missing metrics directly from the orders state
  const completedOrders = orders.filter(o => o.status === OrderStatus.COMPLETED).length;
  const pendingOrders = orders.filter(o => o.status === OrderStatus.PENDING).length;

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
  
  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        {/* FIX: Pass the 'value' prop to make it a controlled component */}
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Revenue"
          value={metrics.totalRevenue}
          prefix="$"
          icon={<DollarSign />}
          // trend={{ value: 12.5, isPositive: true }} // Example trend
          isLoading={isLoading}
        />
        <StatCard
          title="Total Orders"
          value={metrics.totalOrders}
          icon={<ShoppingCart />}
          // trend={{ value: 5.2, isPositive: true }} // Example trend
          isLoading={isLoading}
        />
        <StatCard
          title="Completed Orders"
          value={completedOrders}
          icon={<CheckCircle />}
          // trend={{ value: 8.1, isPositive: true }} // Example trend
          isLoading={isLoading}
        />
        <StatCard
          title="Pending Orders"
          value={pendingOrders}
          icon={<Clock />}
          // trend={{ value: 2.1, isPositive: false }} // Example trend
          isLoading={isLoading}
        />
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