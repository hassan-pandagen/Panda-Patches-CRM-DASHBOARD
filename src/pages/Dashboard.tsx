// src/pages/Dashboard.tsx - SIMPLIFIED & FIXED

import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Package, DollarSign, AlertCircle, CheckCircle, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';

import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabaseClient';
import { useDashboardMetrics } from "../hooks/useDashboardMetrics";
import { mapDbToOrder } from '../services/orderService';
import { Order, OrderStatus, UserRole } from "../types";
import { queryKeys } from '../constants/queryKeys';
import CardSkeleton from '../components/CardSkeleton';
import DashboardRecentOrdersTable from '../components/dashboard/DashboardRecentOrdersTable';
import ProductionProgress from '../components/dashboard/ProductionProgress'; 
import ToggleButtons from '../components/ui/ToggleButtons'; // Assuming this exists
import DateRangeFilter, { DateRange, getDefaultRange } from '../components/ui/DateRangeFilter'; // Corrected import

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 }
  }
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 100, damping: 15 }
  }
};

const StatCard: React.FC<{
  title: string;
  value: string | number;
  prefix?: string;
  icon: React.ReactNode;
  gradient: string;
  onClick?: () => void;
  isLoading?: boolean;
}> = ({ title, value, prefix = '', icon, gradient, onClick, isLoading = false }) => (
  <motion.div variants={cardVariants}>
    <div 
      className={`group relative ${onClick ? 'cursor-pointer' : ''}`} 
      onClick={onClick}
    >
      <div className={`absolute -inset-0.5 ${gradient} rounded-2xl opacity-0 group-hover:opacity-50 blur transition duration-500`} />
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
                {prefix}{typeof value === 'number' ? value.toLocaleString() : value}
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
  const [searchTerm, setSearchTerm] = useState('');

  // 📊 STAT CARDS - Controlled by Week/Month/Today Toggle
  const [metricsView, setMetricsView] = useState<'today' | 'week' | 'month'>('week');
  
  // 📅 ORDERS TABLE - Controlled by Custom Date Range
  const [ordersDateRange, setOrdersDateRange] = useState<DateRange>(getDefaultRange());

  // No need for initialization useEffect - getDefaultRange() handles it

  // Calculate metrics date range based on toggle
  const metricsDateRange = useMemo(() => {
    const endDate = new Date();
    const startDate = new Date();
    
    if (metricsView === 'today') {
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (metricsView === 'week') {
      startDate.setDate(endDate.getDate() - 7);
    } else {
      startDate.setMonth(endDate.getMonth() - 1);
    }
    
    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    };
  }, [metricsView]);

  // 🎯 SINGLE QUERY - Fetch orders for BOTH metrics and table
  // Metrics uses metricsDateRange, Table uses ordersDateRange
  const { 
    data: metricsOrders = [], 
    isLoading: metricsLoading 
  } = useQuery({
    queryKey: queryKeys.dashboard.metrics(metricsDateRange.startDate, metricsDateRange.endDate),
    queryFn: async () => {
      const start = new Date(`${metricsDateRange.startDate}T00:00:00.000Z`).toISOString();
      const end = new Date(`${metricsDateRange.endDate}T23:59:59.999Z`).toISOString();
      
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .gte('created_at', start)
        .lte('created_at', end);
      
      if (error) throw error;
      return (data || []).map(mapDbToOrder);
    },
    staleTime: 60000,
    enabled: !!user,
  });

  // 📋 Separate query for table (different date range)
  const { 
    data: tableOrders = [], 
    isLoading, 
    error 
  } = useQuery({
    queryKey: queryKeys.dashboard.table(ordersDateRange.startDate, ordersDateRange.endDate),
    queryFn: async () => {
      if (!ordersDateRange.startDate || !ordersDateRange.endDate) return [];
      
      const start = new Date(`${ordersDateRange.startDate}T00:00:00.000Z`).toISOString();
      const end = new Date(`${ordersDateRange.endDate}T23:59:59.999Z`).toISOString();
      
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .gte('created_at', start)
        .lte('created_at', end);
      
      if (error) throw error;
      return (data || []).map(mapDbToOrder);
    },
    staleTime: 60000,
    enabled: !!user && !!ordersDateRange.startDate && !!ordersDateRange.endDate,
  });

  // Calculate metrics from metricsOrders
  const {
    totalRevenue = 0,
    totalOrders = 0,
    totalCollected = 0,
    actionablePendingAmount = 0,
  } = useDashboardMetrics(metricsOrders);

  // Filter table orders by search
  const filteredRecentOrders = useMemo(() => {
    if (!searchTerm) return tableOrders;
    const term = searchTerm.toLowerCase();
    return tableOrders.filter(order => 
      order.customerName?.toLowerCase().includes(term) ||
      order.orderNumber?.toString().toLowerCase().includes(term)
    );
  }, [tableOrders, searchTerm]);

  const handleSearchEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchTerm) {
      navigate(`/search?q=${encodeURIComponent(searchTerm)}`);
    }
  };

  if (isLoading && !tableOrders.length && !metricsOrders.length) {
    return (
      <div className="space-y-6 p-6">
        <div className="h-12 w-48 bg-slate-800 rounded animate-pulse mb-6"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1,2,3,4].map(i => <CardSkeleton key={i} />)}
        </div>
      </div>
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

  return (
    <div className="relative min-h-screen">
      {/* Subtle Background Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-brand-orange/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 space-y-8">
        {/* Header with Toggle */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
        >
          <div>
            <h1 className="text-4xl font-bold text-white">Dashboard</h1>
            <p className="text-slate-400 mt-2">
              Real-time business overview for{' '}
              {metricsView === 'today' ? 'today' : metricsView === 'week' ? 'this week' : 'this month'}.
            </p>
          </div>
          
          {/* Today/Week/Month Toggle - Controls ONLY Stat Cards */}
          <ToggleButtons 
            view={metricsView} 
            onViewChange={setMetricsView} 
          />
        </motion.div>

        {/* STAT CARDS - Controlled by Today/Week/Month Toggle */}
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
            onClick={() => navigate('/orders')}
            isLoading={metricsLoading}
          />

          <StatCard
            title="Pending Payment"
            value={actionablePendingAmount}
            prefix="$"
            icon={<AlertCircle className="w-6 h-6 text-amber-300" />}
            gradient="bg-gradient-to-r from-amber-500 to-yellow-500"
            onClick={() => navigate('/orders?filter=PAYMENT_PENDING')}
            isLoading={metricsLoading}
          />

          <StatCard
            title="Total Orders"
            value={totalOrders}
            icon={<TrendingUp className="w-6 h-6 text-purple-400" />}
            gradient="bg-gradient-to-r from-purple-500 to-pink-500"
            onClick={() => navigate('/orders')}
            isLoading={metricsLoading}
          />

          <StatCard
            title="Collected"
            value={totalCollected}
            prefix="$"
            icon={<CheckCircle className="w-6 h-6 text-green-400" />}
            gradient="bg-gradient-to-r from-green-500 to-emerald-500"
            onClick={() => navigate('/orders?filter=PAID')}
            isLoading={metricsLoading}
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
                <ProductionProgress orders={metricsOrders} />
              </div>
            </div>

            {/* Attendance Tracking - Admin Only */}
            {isAdmin && (
              <div 
                className="relative group cursor-pointer"
                onClick={() => navigate('/clock-in-out')}
              >
                <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl opacity-0 group-hover:opacity-30 blur transition duration-500" />
                <div className="relative bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl transform group-hover:scale-[1.02] transition-all duration-300">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-white">Attendance Tracking</h3>
                      <p className="text-sm text-slate-400 mt-1">View team activity & productivity</p>
                    </div>
                    <div className="p-3 bg-gradient-to-br from-white/10 to-white/5 rounded-xl">
                      <Package className="w-6 h-6 text-emerald-400" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {/* RIGHT COLUMN - Orders Table with Independent Date Filter */}
          <div className="lg:col-span-2 space-y-4">
            {/* Recent Orders Header & Date Filter */}
            <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
                <h2 className="text-xl font-semibold text-white">Recent Orders</h2>
              </div>
              
              {/* Date Range Filter */}
              <DateRangeFilter 
                value={ordersDateRange}
                onChange={setOrdersDateRange}
              />
            </div>

            {/* Recent Orders Table */}
            <div className="relative group">
              <DashboardRecentOrdersTable 
                orders={filteredRecentOrders.map(o => ({...o, status: o.status as OrderStatus}))} 
                isLoading={isLoading} 
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}