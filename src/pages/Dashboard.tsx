import React, { useState, useMemo, useCallback, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { localMidnightISO, localNextDayISO } from "../utils/dateFilters";
import ActivityFeed from "../components/dashboard/ActivityFeed";
import {
  Clock,
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
  const [dateView, setDateViewRaw] = useState<string>("month");
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
    if ((dateView === "custom" || dateView === "last-month" || dateView === "quarter" || dateView === "year") && customDateRange) {
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
    setDateViewRaw("custom");
  };

  const setDateView = useCallback((v: string) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    if (v === 'last-month') {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0);
      setCustomDateRange({ startDate: formatDateOnly(start), endDate: formatDateOnly(end) });
      setDateViewRaw('last-month');
    } else if (v === 'quarter') {
      const qStart = new Date(year, Math.floor(month / 3) * 3, 1);
      const qEnd = new Date(year, Math.floor(month / 3) * 3 + 3, 0);
      setCustomDateRange({ startDate: formatDateOnly(qStart), endDate: formatDateOnly(qEnd) });
      setDateViewRaw('quarter');
    } else if (v === 'year') {
      setCustomDateRange({ startDate: `${year}-01-01`, endDate: `${year}-12-31` });
      setDateViewRaw('year');
    } else {
      setDateViewRaw(v);
      if (v !== 'custom') setCustomDateRange(null);
    }
  }, []);

  // Month navigation
  const activeMonth = activeDateRange.startDate.substring(0, 7);
  const handlePrevMonth = useCallback(() => {
    const [y, m] = activeDateRange.startDate.split('-').map(Number);
    const start = new Date(y, m - 2, 1);
    const end = new Date(y, m - 1, 0);
    setCustomDateRange({ startDate: formatDateOnly(start), endDate: formatDateOnly(end) });
    setDateViewRaw('custom');
  }, [activeDateRange.startDate]);

  const handleNextMonth = useCallback(() => {
    const [y, m] = activeDateRange.startDate.split('-').map(Number);
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0);
    setCustomDateRange({ startDate: formatDateOnly(start), endDate: formatDateOnly(end) });
    setDateViewRaw('custom');
  }, [activeDateRange.startDate]);

  // Build Orders page URL with current date range carried over
  const ordersUrl = useCallback((extra?: string) => {
    const params = new URLSearchParams();
    if (dateView !== 'month') {
      params.set('dateView', dateView);
    }
    if (customDateRange) {
      params.set('startDate', customDateRange.startDate);
      params.set('endDate', customDateRange.endDate);
    }
    if (extra) {
      const extraParams = new URLSearchParams(extra);
      extraParams.forEach((v, k) => params.set(k, v));
    }
    const qs = params.toString();
    return `/orders${qs ? `?${qs}` : ''}`;
  }, [dateView, customDateRange]);

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

      let query = supabase
         .from("orders")
         .select("id, order_number, customer_name, customer_email, design_name, status, created_at, updated_at, sales_agent, order_amount, amount_paid, is_urgent, lead_source, patches_type")
         .gte("created_at", localMidnightISO(activeDateRange.startDate))
         .lt("created_at", localNextDayISO(activeDateRange.endDate));

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
    if (dateView === "custom") {
      const s = new Date(activeDateRange.startDate);
      const e = new Date(activeDateRange.endDate);
      // If it's a full single month, show "February 2026" etc.
      if (s.getDate() === 1 && e.getDate() === new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate() && s.getMonth() === e.getMonth()) {
        return s.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      }
      return `${s.toLocaleDateString()} - ${e.toLocaleDateString()}`;
    }
    return dateView === "today" ? "today" : dateView === "week" ? "this week" : "this month";
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
            <ToggleButtons
              view={dateView}
              onViewChange={setDateView}
              activeMonth={activeMonth}
              onPrevMonth={handlePrevMonth}
              onNextMonth={handleNextMonth}
            />
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
            onClick={() => navigate(ordersUrl())}
            isLoading={isLoading}
          />

          {/* 2. Pending Payment - Amber Gradient */}
          <DashboardStatCard
            title="Pending Payment"
            value={actionablePendingAmount}
            prefix="$"
            icon={<AlertCircle className="w-6 h-6 text-amber-300" />}
            gradient="bg-gradient-to-r from-amber-500 to-yellow-500"
            onClick={() => navigate(ordersUrl("filter=PAYMENT_PENDING"))}
            isLoading={isLoading}
          />

          {/* 3. Total Orders - Purple Gradient */}
          <DashboardStatCard
            title="Total Orders"
            value={totalOrders}
            icon={<TrendingUp className="w-6 h-6 text-purple-400" />}
            gradient="bg-gradient-to-r from-purple-500 to-pink-500"
            onClick={() => navigate(ordersUrl())}
            isLoading={isLoading}
          />

          {/* 4. Amount Collected - Green Gradient */}
          <DashboardStatCard
            title="Collected"
            value={totalCollected}
            prefix="$"
            icon={<CheckCircle className="w-6 h-6 text-green-400" />}
            gradient="bg-gradient-to-r from-green-500 to-emerald-500"
            onClick={() => navigate(ordersUrl("filter=PAID"))}
            isLoading={isLoading}
          />
        </motion.div>

        {/* MAIN CONTENT GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT COLUMN: Production & Quick Actions */}
          <div className="lg:col-span-1 space-y-6">
            <SpotlightCard className="p-6">
              <ProductionProgress orders={orders} buildOrdersUrl={ordersUrl} />
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

        {/* ACTIVITY FEED — Full Width */}
        <SpotlightCard className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-brand-orange" />
              Recent Activity
            </h3>
            <span className="text-xs text-slate-500">Live updates</span>
          </div>
          <ActivityFeed />
        </SpotlightCard>
      </div>
    </div>
  );
}
