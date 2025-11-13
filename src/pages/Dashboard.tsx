// src/pages/Dashboard.tsx

import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Package, CheckCircle, DollarSign, Clock } from 'lucide-react';

import { useAuth } from '../contexts/AuthContext';
import Spinner from "../components/ui/Spinner";
import StatCard from "../components/ui/StatCard";
import DateRangeFilter, { DateRange, getDefaultRange } from "../components/ui/DateRangeFilter";
import { fetchOrdersBetween } from "../services/orderService";
import { useDashboardMetrics } from "../hooks/useDashboardMetrics";
import { Order, OrderStatus } from "../types";
import ProductionProgress from '../components/dashboard/ProductionProgress';
import DashboardRecentOrdersTable from '../components/dashboard/DashboardRecentOrdersTable';

export default function Dashboard() {
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultRange);
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleDateChange = useCallback((range: DateRange) => {
    setDateRange(range);
  }, []);

  const { data: orders = [], isLoading, error } = useQuery({
    queryKey: ["dashboard-orders", dateRange.startDate, dateRange.endDate],
    queryFn: async () => {
      const start = new Date(`${dateRange.startDate}T00:00:00.000Z`).toISOString();
      const end = new Date(`${dateRange.endDate}T23:59:59.999Z`).toISOString();
      return fetchOrdersBetween(start, end);
    },
    staleTime: 60000,
    enabled: !!user,
  });

  const {
    totalRevenue,
    totalOrders,
    totalCollected,
    pendingAmount,
    inProductionOrders,
  } = useDashboardMetrics(orders);

  // --- FIX: Manually calculate pending amount to exclude completed/shipped/delivered orders ---
  const actionablePendingAmount = useMemo(() => {
    // An order has a pending amount if it's not cancelled or refunded, and there's a balance.
    return orders
      .filter(order => ![OrderStatus.CANCELLED, OrderStatus.REFUNDED].includes(order.status))
      .reduce((sum, order) => sum + order.amountRemaining, 0);
  }, [orders]);

  // --- FIX: Manually calculate urgent orders to exclude completed/shipped/delivered statuses ---
  const urgentOrdersCount = useMemo(() => {
    return orders.filter(
      (order) =>
        order.is_urgent &&
        ![OrderStatus.COMPLETED, OrderStatus.SHIPPED, OrderStatus.DELIVERED].includes(order.status)
    ).length;
  }, [orders]);

  const revenueTrend = useMemo(() => {
    const daily = orders.reduce((acc: Record<string, number>, o: Order) => {
      const d = new Date(o.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      acc[d] = (acc[d] || 0) + Number(o.orderAmount || 0);
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(daily)
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-7);
  }, [orders]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-400">
        Error loading dashboard: {(error as Error).message}
      </div>
    );
  }

  const handleStatCardClick = (filter: Record<string, string>) => {
    const params = new URLSearchParams(filter);
    navigate(`/orders?${params.toString()}`);
  };

  const setDatePreset = (preset: 'week' | 'month' | '60days') => {
    const endDate = new Date();
    const startDate = new Date();

    if (preset === 'week') {
      startDate.setDate(endDate.getDate() - 7);
    } else if (preset === 'month') {
      startDate.setMonth(endDate.getMonth() - 1);
    } else if (preset === '60days') {
      startDate.setDate(endDate.getDate() - 60);
    }

    setDateRange({
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    });
  };

  return (
    <div className="space-y-8 p-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400 mt-2">
            Real-time business overview and performance metrics
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch gap-2 bg-slate-800 border border-slate-700 rounded-lg p-2">
          <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1">
            <button onClick={() => setDatePreset('week')} className="px-3 py-1.5 text-xs rounded-md hover:bg-slate-700 text-slate-300">This Week</button>
            <button onClick={() => setDatePreset('month')} className="px-3 py-1.5 text-xs rounded-md hover:bg-slate-700 text-slate-300">This Month</button>
            <button onClick={() => setDatePreset('60days')} className="px-3 py-1.5 text-xs rounded-md hover:bg-slate-700 text-slate-300">Last 60 Days</button>
          </div>
          <DateRangeFilter value={dateRange} onChange={handleDateChange} />
        </div>
      </div>

      {!orders || orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
          <Package className="w-16 h-16 text-slate-600 mb-4" />
          <h3 className="text-xl font-semibold text-slate-300 mb-2">No Orders Found</h3>
          <p className="text-slate-400 max-w-md">
            No orders found between {dateRange.startDate} and {dateRange.endDate}.
            Try adjusting the date range or create a new order.
          </p>
        </div>
      ) : (
        <>
          {/* --- THE ONLY CHANGES ARE IN THIS BLOCK --- */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard
              title="Total Revenue"
              value={`$${totalRevenue.toLocaleString()}`}
              icon={<DollarSign className="w-6 h-6" />}
              color="primary"
            />
            <StatCard
              title="Total Orders"
              value={totalOrders}
              subtitle={`${urgentOrdersCount} urgent`}
              icon={<Package className="w-6 h-6" />}
              onClick={() => handleStatCardClick({ filter: 'urgent' })}
              color="info"
              className="cursor-pointer hover:border-blue-400/50"
            />
            <StatCard
              title="Amount Collected"
              value={`$${totalCollected.toLocaleString()}`}
              icon={<CheckCircle className="w-6 h-6" />}
              color="success"
            />
            <StatCard
              title="Pending Amount"
              value={`$${actionablePendingAmount.toLocaleString()}`}
              icon={<Clock className="w-6 h-6" />}
              onClick={() => handleStatCardClick({ payment_status: 'pending' })}
              color="warning"
              className="cursor-pointer hover:border-amber-400/50"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ProductionProgress orders={orders} />
            <DashboardRecentOrdersTable orders={orders} />
          </div>

          <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">
              Revenue Trend (Last 7 days)
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={revenueTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1f2937", borderRadius: 8, border: "none" }}
                  itemStyle={{ color: "#fff" }}
                />
                <Line type="monotone" dataKey="revenue" stroke="#10B981" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}