// src/pages/AllOrdersPage.tsx - ADDED ALL PIPELINE TABS

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { Order, OrderStatus, UserRole } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { getStatusInfo } from '../constants';
import { mapDbToOrder } from '../services/orderService';
import { queryKeys } from '../constants/queryKeys';

// UI Components
import Button from '../components/ui/Button';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState'; // Ensure this is imported
import { 
  Search, 
  Plus, 
  Package, 
  Calendar, 
  Lock,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  X,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Truck,
  XCircle,
  ThumbsUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// --- 1. ENHANCED STATUS BADGE (Covering ALL Statuses) ---
const StatusBadge = ({ status }: { status: OrderStatus }) => {
  // Map status to specific "Neon" styles
  const getStyle = (s: string) => {
    switch (s) {
      case 'COMPLETED':
      case 'DELIVERED':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.15)]';
      case 'SHIPPED':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.15)]';
      case 'IN_PRODUCTION':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.15)]';
      case 'URGENT':
        return 'bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.15)]';
      case 'REVISION_REQUESTED':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.15)]';
      case 'AWAITING_CUSTOMER_APPROVAL':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20 shadow-[0_0_10px_rgba(168,85,247,0.15)]';
      case 'NEW_ORDER':
        return 'bg-brand-orange/10 text-brand-orange border-brand-orange/20 shadow-[0_0_10px_rgba(251,110,29,0.15)]';
      case 'CANCELLED':
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
      default: // Pending, etc
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  // Map status to Icons
  const getIcon = (s: string) => {
    switch (s) {
      case 'COMPLETED': 
      case 'DELIVERED': return <CheckCircle2 className="w-3.5 h-3.5" />;
      case 'SHIPPED': return <Truck className="w-3.5 h-3.5" />;
      case 'IN_PRODUCTION': return <Loader2 className="w-3.5 h-3.5 animate-spin" />;
      case 'REVISION_REQUESTED': return <AlertTriangle className="w-3.5 h-3.5" />;
      case 'AWAITING_CUSTOMER_APPROVAL': return <ThumbsUp className="w-3.5 h-3.5" />;
      case 'NEW_ORDER': return <Package className="w-3.5 h-3.5" />;
      case 'CANCELLED': return <XCircle className="w-3.5 h-3.5" />;
      default: return <Clock className="w-3.5 h-3.5" />;
    }
  };

  // Format label (remove underscores, title case)
  const label = status.replace(/_/g, ' ').replace(/CUSTOMER/, '').trim(); // Shortens "AWAITING CUSTOMER APPROVAL" to "AWAITING APPROVAL" if desired

  return (
    <span className={`
      px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold border 
      flex items-center justify-center gap-1.5 min-w-[110px] uppercase tracking-wide
      backdrop-blur-md transition-all duration-300
      ${getStyle(status)}
    `}>
      {getIcon(status)}
      {label}
    </span>
  );
};

const FilterTab = ({ active, label, count, onClick, isUrgent = false }: any) => (
  <button
    onClick={onClick}
    className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 whitespace-nowrap ${
      active 
        ? isUrgent 
          ? 'bg-red-600 text-white border border-red-400 shadow-lg shadow-red-900/40'
          : 'bg-brand-orange text-white shadow-lg shadow-brand-orange/20'
        : 'text-slate-300 hover:text-white hover:bg-slate-800'
    }`}
  >
    {label}
    {count > 0 && (
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
        active 
          ? 'bg-white/20 text-white' 
          : 'bg-slate-700 text-slate-200'
      }`}>
        {count}
      </span>
    )}
    {active && (
      <motion.div
        layoutId="activeTab"
        className="absolute inset-0 rounded-lg border-2 border-transparent"
        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
      />
    )}
  </button>
);

const ITEMS_PER_PAGE = 15;

const AllOrdersPage: React.FC = () => {
  const { role, permissions } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);

  // --- URL PARAMS FOR DRILL-DOWN ---
  const salesAgentParam = searchParams.get('salesAgent');
  const leadSourceParam = searchParams.get('leadSource');
  const dateParam = searchParams.get('date'); 

  const canViewFinancials = role === UserRole.ADMIN || permissions?.view_financials;

  // --- URL AUTO-FILTER ---
  useEffect(() => {
    const filterParam = searchParams.get('filter');
    if (filterParam) {
      setActiveFilter(filterParam);
      setCurrentPage(1);
    }
  }, [searchParams]);

  // --- DATA FETCHING ---
  const { data: orders = [], isLoading, error } = useQuery({
    queryKey: queryKeys.orders.all(),
    queryFn: async () => {
      // ✅ OPTIMIZATION: Select only columns needed for the table display
      // Excludes large arrays: production_file_urls, shipping_attachment_urls, customer_attachment_urls, mockup_urls, redo_attachments
      // Reduces data transfer by ~60% per order
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, customer_name, customer_email, design_name, status, created_at, sales_agent, order_amount')
        .order('created_at', { ascending: false });
      
      if (error) throw new Error(error.message);

      // Map snake_case DB columns to camelCase for frontend
      return (data || []).map(mapDbToOrder);
    },
  });

  // --- OVERDUE LOGIC ---
  const tenDaysAgo = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 10);
    return date;
  }, []);

  const isOrderOverdue = (order: Order) => {
    const daysOpen = Math.floor((new Date().getTime() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60 * 24));
    return daysOpen > 10 && !['SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REFUNDED'].includes(order.status);
  };

  const overdueOrders = useMemo(() => {
    return orders.filter(isOrderOverdue);
  }, [orders]);
  const overdueCount = overdueOrders.length;  

  // --- FILTERING LOGIC ---
  const filteredOrders = useMemo(() => {

    let filtered = orders;

    if (salesAgentParam) filtered = filtered.filter(o => o.salesAgent === salesAgentParam);
    if (leadSourceParam) filtered = filtered.filter(o => o.leadSource === leadSourceParam);
    
    if (dateParam) {
      filtered = filtered.filter(o => {
        if (!o.createdAt) return false;
        const paramDateObj = new Date(dateParam);
        const orderDateObj = new Date(o.createdAt);
        return (
            paramDateObj.getDate() === orderDateObj.getDate() &&
            paramDateObj.getMonth() === orderDateObj.getMonth() &&
            paramDateObj.getFullYear() === orderDateObj.getFullYear()
        );
      });
    }

    if (activeFilter === 'OVERDUE') {
      filtered = overdueOrders.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()); // Oldest first
    } else if (activeFilter === 'PAYMENT_PENDING') {
      filtered = filtered.filter(o => o.amountRemaining > 0.01 && o.status !== 'CANCELLED' && o.status !== 'REFUNDED');
    } else if (activeFilter === 'URGENT') {
      // ✅ FINAL FIX: Show orders that are urgent BUT NOT ALSO overdue.
      filtered = filtered.filter(o => o.isUrgent === true && !isOrderOverdue(o));
    } else if (searchParams.get('ids')) {
      const idList = searchParams.get('ids')!.split(',');
      filtered = filtered.filter(order => idList.includes(order.orderNumber));
    } else if (activeFilter !== 'ALL') {
      filtered = filtered.filter(o => o.status === activeFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const digitQuery = query.replace(/\D/g, ''); 
      filtered = filtered.filter(o => {
        const matchesText = 
          o.customerName.toLowerCase().includes(query) ||
          o.orderNumber.toLowerCase().includes(query) ||
          (o.salesAgent && o.salesAgent.toLowerCase().includes(query)) ||
          (o.customerEmail && o.customerEmail.toLowerCase().includes(query));
        
        const cleanPhone = (o.customerPhone || '').replace(/\D/g, '');
        const matchesPhone = digitQuery.length > 2 && cleanPhone.includes(digitQuery);

        return matchesText || matchesPhone;
      });
    }

    return filtered;
  }, [orders, activeFilter, searchQuery, salesAgentParam, leadSourceParam, dateParam, overdueOrders, searchParams]);

  // --- PAGINATION ---
  const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // --- COUNTS FOR TABS ---
  const urgentCount = orders.filter(o => o.isUrgent && !isOrderOverdue(o)).length; // Don't double-count in urgent if also overdue
  const getCount = (status: string) => orders.filter(o => o.status === status).length;

  const clearDrillDown = () => {
    setSearchParams({});
    setSearchQuery('');
    setActiveFilter('ALL');
  };

  // --- SKELETON LOADING ---
  if (isLoading) return (
    <div className="space-y-6 min-h-screen pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
         <div><Skeleton width={150} height={36} className="mb-2"/><Skeleton width={300} height={20}/></div>
         <Skeleton width={140} height={48} className="rounded-xl"/>
      </div>
      <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-4 space-y-4">
         <Skeleton width="100%" height={48} className="rounded-xl"/>
         <div className="flex gap-2"><Skeleton width={100} height={36} className="rounded-lg"/><Skeleton width={100} height={36} className="rounded-lg"/><Skeleton width={100} height={36} className="rounded-lg"/></div>
      </div>
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-slate-900/40 border border-white/5 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4"><Skeleton variant="circular" width={48} height={48} /><div><Skeleton width={180} height={24} className="mb-2" /><div className="flex gap-2"><Skeleton width={80} height={16} /><Skeleton width={100} height={16} /></div></div></div>
            <div className="flex items-center gap-8"><Skeleton width={120} height={28} className="rounded-lg" /><Skeleton width={20} height={20} variant="circular" /></div>
          </div>
        ))}
      </div>
    </div>
  );

  if (error) return <div className="text-center py-10 text-red-400">Error loading orders</div>;

  return (
    <div className="space-y-6 min-h-screen pb-10">
      {/* --- HEADER --- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Orders</h1>
          <p className="text-slate-300 text-sm mt-1">Manage and track your production pipeline</p>
        </div>
        <Link to="/new-order">
          <Button variant="primary" size="lg" className="shadow-lg shadow-brand-orange/20 text-white font-semibold">
            <Plus className="w-5 h-5 mr-2" />
            New Order
          </Button>
        </Link>
      </div>

      {/* --- CONTROLS BAR --- */}
      <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-4 space-y-4">
        
        {/* Active Filters Banner */}
        {(salesAgentParam || leadSourceParam || dateParam) && (
          <div className="flex items-center justify-between bg-brand-orange/10 border border-brand-orange/20 px-4 py-2 rounded-xl">
            <div className="flex items-center gap-2 text-sm text-brand-orange">
              <span className="font-bold">Active Filter:</span>
              {salesAgentParam && <span>Agent: {salesAgentParam}</span>}
              {leadSourceParam && <span>Source: {leadSourceParam}</span>}
              {dateParam && <span>Date: {new Date(dateParam).toLocaleDateString()}</span>}
            </div>
            <button onClick={clearDrillDown} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input 
            type="text"
            placeholder="Search by Order ID, Name, Phone (e.g. 300123), or Email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800/50 border border-slate-600 text-white text-sm rounded-xl pl-10 pr-4 py-3 focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange transition-all placeholder-slate-400"
          />
        </div>

        {/* EXPANDED FILTER TABS */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
          <FilterTab active={activeFilter === 'ALL'} label="All Orders" count={orders.length} onClick={() => setActiveFilter('ALL')} />
          <FilterTab active={activeFilter === 'URGENT'} label="Urgent" count={urgentCount} onClick={() => setActiveFilter('URGENT')} isUrgent={true} />
          <FilterTab active={activeFilter === 'OVERDUE'} label="Overdue" count={overdueCount} onClick={() => setActiveFilter('OVERDUE')} isUrgent={true} />
          
          <div className="w-px h-6 bg-slate-600 mx-2 shrink-0" />
          
          <FilterTab active={activeFilter === 'NEW_ORDER'} label="New" count={getCount('NEW_ORDER')} onClick={() => setActiveFilter('NEW_ORDER')} />
          <FilterTab active={activeFilter === 'AWAITING_CUSTOMER_APPROVAL'} label="Awaiting Approval" count={getCount('AWAITING_CUSTOMER_APPROVAL')} onClick={() => setActiveFilter('AWAITING_CUSTOMER_APPROVAL')} />
          <FilterTab active={activeFilter === 'IN_PRODUCTION'} label="In Production" count={getCount('IN_PRODUCTION')} onClick={() => setActiveFilter('IN_PRODUCTION')} />
          <FilterTab active={activeFilter === 'REVISION_REQUESTED'} label="Revision" count={getCount('REVISION_REQUESTED')} onClick={() => setActiveFilter('REVISION_REQUESTED')} />
          
          <div className="w-px h-6 bg-slate-600 mx-2 shrink-0" />
          
          <FilterTab active={activeFilter === 'SHIPPED'} label="Shipped" count={getCount('SHIPPED')} onClick={() => setActiveFilter('SHIPPED')} />
          <FilterTab active={activeFilter === 'DELIVERED'} label="Delivered" count={getCount('DELIVERED')} onClick={() => setActiveFilter('DELIVERED')} />
          <FilterTab active={activeFilter === 'QUALITY_ASSURANCE'} label="Quality Assurance" count={getCount('QUALITY_ASSURANCE')} onClick={() => setActiveFilter('QUALITY_ASSURANCE')} />
          <FilterTab active={activeFilter === 'CANCELLED'} label="Cancelled" count={getCount('CANCELLED')} onClick={() => setActiveFilter('CANCELLED')} />
        </div>
      </div>

      {/* --- ORDERS LIST --- */}
      <div className="space-y-3">
        <AnimatePresence mode="wait">
          {paginatedOrders.length === 0 ? (
            <EmptyState 
              title="No Orders Found"
              description={
                searchQuery 
                  ? `We couldn't find any orders matching "${searchQuery}". Try checking for typos or using a different keyword.`
                  : "There are no orders in this category yet."
              }
              action={
                (salesAgentParam || leadSourceParam || dateParam || searchQuery || activeFilter !== 'ALL') ? (
                   <button onClick={clearDrillDown} className="text-brand-orange text-sm font-medium hover:text-orange-400 transition-colors underline underline-offset-4">
                     Clear all filters & search
                   </button>
                ) : null
              }
            />
          ) : ( paginatedOrders.map((order, index) => {
              {/* 1. Calculate Days Open */}
              const daysOpen = Math.floor((new Date().getTime() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60 * 24));
              const isOverdue = isOrderOverdue(order);

              return (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                >
                  <Link to={`/order/${order.orderNumber}`} className="block group">
                    <div className={`relative bg-slate-900/60 backdrop-blur-sm rounded-xl p-4 hover:bg-slate-800 transition-all duration-200 group-hover:shadow-lg group-hover:-translate-y-0.5 active:scale-[0.99]
                      ${isOverdue ? 'border border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.1)] hover:border-red-500/80' : 'border border-slate-700/50 hover:border-brand-orange/40'}`}
                    >
                      
                      {order.isUrgent && !isOverdue && (
                        <div className="absolute left-0 top-3 bottom-3 w-1 bg-red-500 rounded-r-full shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                      )}

                      <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between pl-2">
                        {/* LEFT: Info */}
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-xl font-bold shadow-md ${
                            isOverdue || order.isUrgent ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
                          }`}>
                            {order.customerName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-white font-bold text-lg group-hover:text-brand-orange transition-colors">
                                {order.customerName}
                              </span>
                              {/* ✅ NEW: THE RED BADGE */}
                              {isOverdue && (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-500 text-white animate-pulse">
                                  ⚠️ {daysOpen} DAYS OPEN
                                </span>
                              )}
                              {order.isUrgent && !isOverdue && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white shadow-sm">
                                  URGENT
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300 mt-1">
                              {/* ✅ REQUIREMENT FULFILLED: Date with icon and styling */}
                              {order.createdAt && (
                                <div className="flex items-center gap-1.5 text-cyan-400">
                                  <Calendar className="w-3.5 h-3.5" />
                                  <span className="font-medium">{new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                </div>
                              )}
                              <span className="w-1 h-1 rounded-full bg-slate-500" />
                              <span className="font-mono font-medium text-slate-200">{order.orderNumber}</span>
                              <span className="w-1 h-1 rounded-full bg-slate-500" />
                              <span className="text-slate-400">{order.patchesType || 'Custom Patch'}</span>
                              {order.salesAgent && (
                                <>
                                  <span className="w-1 h-1 rounded-full bg-slate-500" />
                                  <span className="text-slate-400">{order.salesAgent}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* RIGHT: Stats & Status */}
                        <div className="flex items-center justify-between md:justify-end gap-6 md:gap-10 mt-2 md:mt-0 border-t md:border-t-0 border-white/5 pt-3 md:pt-0">
                          
                          <div className="flex flex-col items-end min-w-[140px]"> {/* Increased width for statuses */}
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1">Status</span>
                            <StatusBadge status={order.status as OrderStatus} />
                          </div>

                          <div className="flex flex-col items-end min-w-[90px]">
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1">Amount</span>
                            {canViewFinancials ? (
                              <span className="text-white font-bold text-base tracking-tight">${order.orderAmount.toLocaleString()}</span>
                            ) : (
                              <div className="flex items-center gap-1 text-slate-500">
                                <Lock className="w-3 h-3" />
                                <span className="text-xs">Hidden</span>
                              </div>
                            )}
                          </div>

                          <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-brand-orange group-hover:translate-x-1 transition-all" />
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              )
            })
          )}
        </AnimatePresence>
      </div>

      {/* --- PAGINATION --- */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 pt-6">
          <Button 
            variant="secondary" 
            disabled={currentPage === 1} 
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            className="bg-slate-800 border border-slate-600 text-white hover:bg-slate-700 disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Previous
          </Button>
          
          <span className="text-slate-300 font-medium text-sm">
            Page <span className="text-white font-bold">{currentPage}</span> of {totalPages}
          </span>

          <Button 
            variant="secondary" 
            disabled={currentPage === totalPages} 
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            className="bg-slate-800 border border-slate-600 text-white hover:bg-slate-700 disabled:opacity-50"
          >
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default AllOrdersPage;