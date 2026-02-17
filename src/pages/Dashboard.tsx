import React, { useState, useMemo, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  DollarSign,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  Package,
} from "lucide-react";
import { motion } from "framer-motion";

import { useAuth } from "../contexts/AuthContext";
import SpotlightCard from "../components/ui/SpotlightCard";
import { supabase } from "../services/supabaseClient";
import { useDashboardMetrics } from "../hooks/useDashboardMetrics";
import { mapDbToOrder } from "../services/orderService";
import { OrderStatus, UserRole } from "../types";
import { queryKeys } from "../constants/queryKeys";
import CardSkeleton from "../components/CardSkeleton";
import DashboardRecentOrdersTable from "../components/dashboard/DashboardRecentOrdersTable";
import ProductionProgress from "../components/dashboard/ProductionProgress";
import ToggleButtons from "../components/ui/ToggleButtons";
import DateRangeFilter, { DateRange } from "../components/ui/DateRangeFilter";

// --- ANIMATION VARIANTS ---
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 100, damping: 15 },
  },
};

// --- LOCAL COMPONENT: DASHBOARD STAT CARD (Reports Theme) ---
interface DashboardCardProps {
  title: string;
  value: number | string;
  prefix?: string;
  suffix?: string;
  icon: React.ReactNode;
  gradient: string; // e.g. "bg-gradient-to-r from-orange-500 to-red-500"
  onClick: () => void;
  isLoading?: boolean;
}

const DashboardStatCard: React.FC<DashboardCardProps> = ({
  title,
  value,
  prefix = "",
  suffix = "",
  icon,
  gradient,
  onClick,
  isLoading,
}) => {
  if (isLoading) return <CardSkeleton />;

  return (
    <motion.div variants={cardVariants}>
      <SpotlightCard onClick={onClick} className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-400 mb-1">{title}</p>
            <h3 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-400 drop-shadow-sm tracking-tight">
              {prefix}
              {typeof value === "number" ? value.toLocaleString() : value}
              {suffix}
            </h3>
          </div>
          <div className="p-2 bg-gradient-to-br from-white/10 to-white/5 rounded-xl border border-white/5 shadow-inner">
            {icon}
          </div>
        </div>
      </SpotlightCard>
    </motion.div>
  );
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, role, isLoading: authLoading } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

  // UNIFIED DATE CONTROL
  const [dateView, setDateView] = useState<
    "today" | "week" | "month" | "custom"
  >("month");
  const [customDateRange, setCustomDateRange] = useState<DateRange | null>(
    null
  );

  // Helper function to convert date to YYYY-MM-DD format (matches DateRangeFilter)
  const formatDateOnly = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper to get the next day (for exclusive end date queries)
  const getNextDay = (dateStr: string): string => {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + 1);
    return formatDateOnly(date);
  };

  // Calculate the active date range
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
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    } else {
      // Full calendar month: 1st to last day of CURRENT month
      // Must capture year/month first to avoid date overflow when day is 31
      const year = startDate.getFullYear();
      const month = startDate.getMonth();

      startDate.setFullYear(year, month, 1);
      startDate.setHours(0, 0, 0, 0);

      // Get last day of current month: day 0 of next month = last day of current month
      endDate.setFullYear(year, month + 1, 0);
      endDate.setHours(23, 59, 59, 999);
    }

    return {
      startDate: formatDateOnly(startDate),
      endDate: formatDateOnly(endDate),
    };
  }, [dateView, customDateRange]);

  const handleCustomDateChange = (range: DateRange) => {
    setCustomDateRange(range);
    setDateView("custom");
  };

  const {
    data: orders = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.dashboard.unified(
      activeDateRange.startDate,
      activeDateRange.endDate
    ),
    queryFn: async () => {
      // Auth check inside query to be safe
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error("Not authenticated");
      }

      // Use .lt() with next day to include ALL orders on the end date
      // Example: endDate "2026-01-31" → lt("2026-02-01") includes all Jan 31 orders
      // Select only columns needed for dashboard - avoids fetching large file URL arrays (50x data reduction)
      let query = supabase
         .from("orders")
         .select("id, order_number, customer_name, customer_email, design_name, status, created_at, updated_at, sales_agent, order_amount, amount_paid, is_urgent, lead_source, patches_type")
         .gte("created_at", activeDateRange.startDate)
         .lt("created_at", getNextDay(activeDateRange.endDate));

      // ✅ FIX ADDED HERE: Force filter by email if not Admin
      // This ensures sales agents ONLY see their own rows, regardless of RLS speed.
      // While RLS is the primary security layer, this prevents UI flicker or showing incorrect data on a slow connection.
      if (role !== UserRole.ADMIN && user?.email) {
        query = query.eq("sales_agent", user.email);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(mapDbToOrder);
    },
    enabled: !!user && !authLoading,
    staleTime: 1000 * 30,               // 30 seconds — balance between fresh data and API calls
    refetchOnMount: true,                // Refetch when navigating to dashboard (but respects staleTime)
    refetchOnWindowFocus: true,          // Refetch when user returns to tab
    refetchInterval: 1000 * 60 * 2,     // Poll every 2 minutes as a safety net
  });

  // Calculate metrics
  const {
    totalRevenue = 0,
    totalOrders = 0,
    totalCollected = 0,
    actionablePendingAmount = 0,
  } = useDashboardMetrics(orders);

  // Filter for recent orders table
  const recentOrders = useMemo(() => {
    let filtered = orders;
    const term = searchTerm.toLowerCase();
    if (searchTerm) {
      filtered = orders.filter(
        (order) =>
          order.customerName?.toLowerCase().includes(term) ||
          order.orderNumber?.toString().toLowerCase().includes(term)
      );
    }
    // Sort by newest
    return [...filtered].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [orders, searchTerm]);

  // Loading State
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-16 h-16 rounded-full border-4 border-slate-700 border-t-brand-orange animate-spin" />
      </div>
    );
  }

  // Error State
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6 text-center">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">
            Error Loading Dashboard
          </h2>
          <p className="text-slate-400 mb-4">{(error as Error).message}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-brand-orange rounded-lg text-white"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const isAdmin = role === UserRole.ADMIN;
  const getViewText = () => {
    if (dateView === "custom")
      return `${new Date(
        activeDateRange.startDate
      ).toLocaleDateString()} - ${new Date(
        activeDateRange.endDate
      ).toLocaleDateString()}`;
    return dateView === "today"
      ? "today"
      : dateView === "week"
      ? "this week"
      : "this month";
  };

  return (
    <div className="relative min-h-screen pb-10">
      {/* Background Ambience */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-brand-orange/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
        >
          <div>
            <h1 className="text-4xl font-bold text-white">Dashboard</h1>
            <p className="text-slate-400 mt-2">
              Real-time business overview for{" "}
              <span className="text-white font-medium">{getViewText()}</span>
            </p>
          </div>

          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
            <ToggleButtons view={dateView} onViewChange={setDateView} />
            <DateRangeFilter
              value={activeDateRange}
              onChange={handleCustomDateChange}
            />
          </div>
        </motion.div>

        {/* STAT CARDS - Updated to Match Reports Page Theme */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {/* 1. Net Revenue - Orange Gradient (Excludes refunded orders) */}
          <DashboardStatCard
            title="Net Revenue"
            value={totalRevenue}
            prefix="$"
            icon={<DollarSign className="w-6 h-6 text-brand-orange" />}
            gradient="bg-gradient-to-r from-brand-orange to-orange-600"
            onClick={() => navigate("/orders")}
            isLoading={isLoading}
          />

          {/* 2. Pending Payment - Amber Gradient */}
          <DashboardStatCard
            title="Pending Payment"
            value={actionablePendingAmount}
            prefix="$"
            icon={<AlertCircle className="w-6 h-6 text-amber-300" />}
            gradient="bg-gradient-to-r from-amber-500 to-yellow-500"
            // ✅ Navigate to filter for unpaid orders
            onClick={() => navigate("/orders?filter=PAYMENT_PENDING")}
            isLoading={isLoading}
          />

          {/* 3. Total Orders - Purple Gradient */}
          <DashboardStatCard
            title="Total Orders"
            value={totalOrders}
            icon={<TrendingUp className="w-6 h-6 text-purple-400" />}
            gradient="bg-gradient-to-r from-purple-500 to-pink-500"
            onClick={() => navigate("/orders")}
            isLoading={isLoading}
          />

          {/* 4. Amount Collected - Green Gradient */}
          <DashboardStatCard
            title="Collected"
            value={totalCollected}
            prefix="$"
            icon={<CheckCircle className="w-6 h-6 text-green-400" />}
            gradient="bg-gradient-to-r from-green-500 to-emerald-500"
            // ✅ Navigate to filter for completed/paid orders
            onClick={() => navigate("/orders?filter=PAID")}
            isLoading={isLoading}
          />
        </motion.div>

        {/* MAIN CONTENT GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT COLUMN: Production & Quick Actions */}
          <div className="lg:col-span-1 space-y-6">
            <SpotlightCard className="p-6">
              <ProductionProgress orders={orders} />
            </SpotlightCard>

            {isAdmin && (
              <SpotlightCard
                onClick={() => navigate("/clock-in-out")}
                className="p-6 cursor-pointer"
              >
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
              </SpotlightCard>
            )}
          </div>

          {/* RIGHT COLUMN: Recent Orders Table */}
          <div className="lg:col-span-2">
            <SpotlightCard className="overflow-hidden">
              <DashboardRecentOrdersTable
                orders={recentOrders.map((o) => ({
                  ...o,
                  status: o.status as OrderStatus,
                }))}
                isLoading={isLoading}
              />
            </SpotlightCard>
          </div>
        </div>
      </div>
    </div>
  );
}
