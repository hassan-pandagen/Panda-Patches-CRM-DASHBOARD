// src/pages/Dashboard.tsx - SMOOTH LOADING (SIMPLIFIED)

import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Package,
  DollarSign,
  AlertCircle,
  CheckCircle,
  TrendingUp,
} from "lucide-react";
import { motion } from "framer-motion";

import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";
import { useDashboardMetrics } from "../hooks/useDashboardMetrics";
import { mapDbToOrder } from "../services/orderService";
import { Order, OrderStatus, UserRole } from "../types";
import { queryKeys } from "../constants/queryKeys";
import CardSkeleton from "../components/CardSkeleton";
import DashboardRecentOrdersTable from "../components/dashboard/DashboardRecentOrdersTable";
import ProductionProgress from "../components/dashboard/ProductionProgress";
import ToggleButtons from "../components/ui/ToggleButtons";
import DateRangeFilter, {
  DateRange,
  getDefaultRange,
} from "../components/ui/DateRangeFilter";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0 },
  },
};

const cardVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.3 },
  },
};

const StatCard: React.FC<{
  title: string;
  value: string | number;
  prefix?: string;
  icon: React.ReactNode;
  gradient: string;
  onClick?: () => void;
  isLoading?: boolean;
}> = ({
  title,
  value,
  prefix = "",
  icon,
  gradient,
  onClick,
  isLoading = false,
}) => (
  <motion.div variants={cardVariants}>
    <div
      className={`group relative ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      <div
        className={`absolute -inset-0.5 ${gradient} rounded-2xl opacity-0 group-hover:opacity-50 blur transition duration-500`}
      />
      <div className="relative bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 transform group-hover:scale-[1.02] transition-all duration-300 shadow-xl group-hover:shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-400 mb-1 uppercase tracking-wider">
              {title}
            </p>
            {isLoading ? (
              <div className="h-9 w-32 bg-slate-700/50 rounded animate-pulse" />
            ) : (
              <p className="text-3xl font-bold text-white">
                {prefix}
                {typeof value === "number" ? value.toLocaleString() : value}
              </p>
            )}
          </div>
          <div className="p-3 bg-gradient-to-br from-white/10 to-white/5 rounded-xl">
            {icon}
          </div>
        </div>
      </div>
    </div>
  </motion.div>
);

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

  // UNIFIED DATE CONTROL - Now controls BOTH stat cards AND table
  const [dateView, setDateView] = useState<"today" | "week" | "month" | "custom">(
    "week"
  );
  const [customDateRange, setCustomDateRange] = useState<DateRange | null>(null);

  // Calculate the active date range based on the view (always fresh)
  const activeDateRange = useMemo(() => {
    if (dateView === "custom" && customDateRange) {
      return customDateRange;
    }

    const endDate = new Date();
    const startDate = new Date();

    if (dateView === "today") {
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (dateView === "week") {
      startDate.setDate(endDate.getDate() - 7);
    } else {
      startDate.setMonth(endDate.getMonth() - 1);
    }

    return {
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
    };
  }, [dateView, customDateRange]);

  // When custom date range is applied, switch to custom view
  const handleCustomDateChange = (range: DateRange) => {
    setCustomDateRange(range);
    setDateView("custom");
  };

  // 🎯 SINGLE FETCH - All data uses the same date range
  const { data: orders = [], isLoading, error } = useQuery({
    queryKey: queryKeys.dashboard.unified(
      activeDateRange.startDate,
      activeDateRange.endDate
    ),
    queryFn: async () => {
      const start = new Date(
        `${activeDateRange.startDate}T00:00:00.000Z`
      ).toISOString();
      const end = new Date(
        `${activeDateRange.endDate}T23:59:59.999Z`
      ).toISOString();

      // ✅ OPTIMIZATION: Select only columns needed for dashboard metrics
      // Excludes large arrays to reduce data transfer
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, status, order_amount, amount_paid, sales_agent, created_at")
        .gte("created_at", start)
        .lte("created_at", end);

      if (error) throw error;
      return (data || []).map(mapDbToOrder);
    },
    staleTime: 60000,
    enabled: !!user,
  });

  // Calculate metrics from orders
  const {
    totalRevenue = 0,
    totalOrders = 0,
    totalCollected = 0,
    actionablePendingAmount = 0,
  } = useDashboardMetrics(orders);

  // Memoize and sort the recent orders for the table
  const recentOrders = useMemo(() => {
    // 1. Filter by search term
    let filtered = orders;
    const term = searchTerm.toLowerCase();
    if (searchTerm) {
      filtered = orders.filter(
        (order) =>
          order.customerName?.toLowerCase().includes(term) ||
          order.orderNumber?.toString().toLowerCase().includes(term)
      );
    }

    // 2. Sort by creation date (descending)
    return [...filtered].sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });
  }, [orders, searchTerm]);

  const handleSearchEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchTerm) {
      navigate(`/search?q=${encodeURIComponent(searchTerm)}`);
    }
  };

  if (isLoading && !orders.length) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="space-y-8"
      >
        {/* Header Skeleton */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-2">
            <div className="h-10 w-48 bg-slate-800/40 rounded-lg animate-pulse" />
            <div className="h-4 w-64 bg-slate-800/20 rounded animate-pulse" />
          </div>
          <div className="h-10 w-72 bg-slate-800/40 rounded-lg animate-pulse" />
        </div>

        {/* Stat Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>

        {/* Content Grid Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <div className="h-64 bg-slate-800/20 border border-white/5 rounded-2xl animate-pulse" />
            <div className="h-32 bg-slate-800/20 border border-white/5 rounded-2xl animate-pulse" />
          </div>
          <div className="lg:col-span-2">
            <div className="h-96 bg-slate-800/20 border border-white/5 rounded-2xl animate-pulse" />
          </div>
        </div>
      </motion.div>
    );
  }

  if (error) {
    return (
      <div className="p-10 text-center text-red-400">
        Error loading dashboard data
      </div>
    );
  }

  const isAdmin = role === UserRole.ADMIN;

  // Get display text for current view
  const getViewText = () => {
    if (dateView === "custom") {
      const start = new Date(activeDateRange.startDate).toLocaleDateString();
      const end = new Date(activeDateRange.endDate).toLocaleDateString();
      return `${start} - ${end}`;
    }
    return dateView === "today" ? "today" : dateView === "week" ? "this week" : "this month";
  };

  return (
    <div className="relative min-h-screen">
      {/* Subtle Background Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-brand-orange/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 space-y-8">
        {/* Header - All in One Line */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
        >
          <div>
            <h1 className="text-4xl font-bold text-white">Dashboard</h1>
            <p className="text-slate-400 mt-2">
              Real-time business overview for {getViewText()}
            </p>
          </div>

          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
            <ToggleButtons view={dateView} onViewChange={setDateView} />
            
            {/* This is now a self-contained popover button */}
            <DateRangeFilter
              value={activeDateRange}
              onChange={handleCustomDateChange}
            />
          </div>
        </motion.div>

        {/* STAT CARDS - Now driven by unified date range */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          <StatCard
            title="Total Revenue"
            value={totalRevenue}
            prefix="$"
            icon={<DollarSign className="w-6 h-6 text-brand-orange" />}
            gradient="bg-gradient-to-r from-brand-orange to-orange-600"
            onClick={() => navigate("/orders")}
            isLoading={isLoading}
          />

          <StatCard
            title="Pending Payment"
            value={actionablePendingAmount}
            prefix="$"
            icon={<AlertCircle className="w-6 h-6 text-amber-300" />}
            gradient="bg-gradient-to-r from-amber-500 to-yellow-500"
            onClick={() => navigate("/orders?filter=PAYMENT_PENDING")}
            isLoading={isLoading}
          />

          <StatCard
            title="Total Orders"
            value={totalOrders}
            icon={<TrendingUp className="w-6 h-6 text-purple-400" />}
            gradient="bg-gradient-to-r from-purple-500 to-pink-500"
            onClick={() => navigate("/orders")}
            isLoading={isLoading}
          />

          <StatCard
            title="Collected"
            value={totalCollected}
            prefix="$"
            icon={<CheckCircle className="w-6 h-6 text-green-400" />}
            gradient="bg-gradient-to-r from-green-500 to-emerald-500"
            onClick={() => navigate("/orders?filter=PAID")}
            isLoading={isLoading}
          />
        </motion.div>

        {/* MAIN CONTENT GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT COLUMN */}
          <div className="lg:col-span-1 space-y-6">
            {/* Production Progress */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl opacity-0 group-hover:opacity-30 blur transition duration-500" />
              <div className="relative bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
                <ProductionProgress orders={orders} />
              </div>
            </div>

            {/* Attendance Tracking - Admin Only */}
            {isAdmin && (
              <div
                className="relative group cursor-pointer"
                onClick={() => navigate("/clock-in-out")}
              >
                <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl opacity-0 group-hover:opacity-30 blur transition duration-500" />
                <div className="relative bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl transform group-hover:scale-[1.02] transition-all duration-300">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-white">
                        Attendance Tracking
                      </h3>
                      <p className="text-sm text-slate-400 mt-1">
                        View team activity & productivity
                      </p>
                    </div>
                    <div className="p-3 bg-gradient-to-br from-white/10 to-white/5 rounded-xl">
                      <Package className="w-6 h-6 text-emerald-400" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN */}
          <div className="lg:col-span-2">
            {/* Recent Orders Table - With Glow Effect */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-2xl opacity-0 group-hover:opacity-40 blur transition duration-500" />
              <DashboardRecentOrdersTable
                orders={recentOrders.map((o) => ({
                  ...o,
                  status: o.status as OrderStatus,
                }))}
                isLoading={isLoading}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
