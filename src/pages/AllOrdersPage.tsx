// src/pages/AllOrdersPage.tsx - SERVER-SIDE PAGINATION & FILTERING

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
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
import EmptyState from '../components/ui/EmptyState';
import SpotlightCard from '../components/ui/SpotlightCard';
import StatusBadge from '../components/ui/StatusBadge';
import {
    Search,
    Plus,
    Calendar,
    Lock,
    ArrowRight,
    ChevronLeft,
    ChevronRight,
    X,
    CheckCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ToggleButtons from '../components/ui/ToggleButtons';
import DateRangeFilter, { DateRange } from '../components/ui/DateRangeFilter';

const FilterTab = React.memo(({ active, label, count, onClick, isUrgent = false }: any) => (
    <button
        onClick={onClick}
        className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 whitespace-nowrap ${active
                ? isUrgent
                    ? 'bg-red-600 text-white border border-red-400 shadow-lg shadow-red-900/40'
                    : 'bg-brand-orange text-white shadow-lg shadow-brand-orange/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
    >
        {label}
        {count > 0 && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${active
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
));
FilterTab.displayName = 'FilterTab';

const ITEMS_PER_PAGE = 15;

// Statuses that are considered "closed" (not active)
const CLOSED_STATUSES = ['SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REFUNDED'];

// ============================================
// CUSTOM HOOK: Debounced value
// ============================================
function useDebouncedValue<T>(value: T, delay: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);
    return debounced;
}

// ============================================
// SERVER-SIDE QUERY: Fetch paginated orders
// ============================================
async function fetchPaginatedOrders(params: {
    page: number;
    filter: string;
    search: string;
    salesAgent?: string;
    leadSource?: string;
    date?: string;
    ids?: string;
    userRole?: UserRole | null;
    userEmail?: string | null;
    dateRangeStart?: string;
    dateRangeEnd?: string;
}): Promise<{ orders: Order[]; totalCount: number }> {
    const { page, filter, search, salesAgent, leadSource, date, ids, userRole, userEmail, dateRangeStart, dateRangeEnd } = params;
    const from = (page - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    const columns = 'id, order_number, customer_name, customer_email, design_name, status, created_at, sales_agent, order_amount, amount_paid, is_urgent';

    // --- IDS drill-down (from dashboard click) ---
    if (ids) {
        const idList = ids.split(',').map(id => id.trim()).filter(Boolean);
        const { data, error } = await supabase
            .from('orders')
            .select(columns, { count: 'exact' })
            .in('order_number', idList)
            .order('created_at', { ascending: false });

        if (error) throw new Error(error.message);
        return { orders: (data || []).map(mapDbToOrder), totalCount: data?.length || 0 };
    }

    // --- Build the base query ---
    let query = supabase.from('orders').select(columns, { count: 'exact' });

    // Filter by sales agent for sales agents only (AGENT/USER see only their assigned orders)
    // ADMIN and PRODUCTION can see all orders
    if (userRole !== UserRole.ADMIN && userRole !== UserRole.PRODUCTION && userEmail) {
        query = query.eq('sales_agent', userEmail);
    }

    // Apply drill-down params
    if (salesAgent) query = query.eq('sales_agent', salesAgent);
    if (leadSource) query = query.eq('lead_source', leadSource);
    if (date) {
        // Filter by date (full day range) — single-day drill-down from dashboard
        const dayStart = `${date}T00:00:00.000Z`;
        const dayEnd = `${date}T23:59:59.999Z`;
        query = query.gte('created_at', dayStart).lte('created_at', dayEnd);
    } else if (dateRangeStart && dateRangeEnd && !search) {
        // Date range filter — skipped when search is active so orders from any date are found
        const nextDay = new Date(dateRangeEnd);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayStr = nextDay.toISOString().split('T')[0];
        query = query.gte('created_at', `${dateRangeStart}T00:00:00.000Z`).lt('created_at', `${nextDayStr}T00:00:00.000Z`);
    }

    // Apply status/special filters
    if (filter === 'OVERDUE') {
        // Overdue = open > 10 days AND not in closed statuses
        const tenDaysAgo = new Date();
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
        query = query
            .lt('created_at', tenDaysAgo.toISOString())
            .not('status', 'in', `(${CLOSED_STATUSES.join(',')})`);
        // Sort oldest first for overdue
        query = query.order('created_at', { ascending: true });
    } else if (filter === 'PAYMENT_PENDING') {
        // Payment pending: order_amount > amount_paid, exclude cancelled/refunded
        // Supabase doesn't support computed column filters, so we fetch more and filter
        query = query
            .not('status', 'in', '(CANCELLED,REFUNDED)')
            .gt('order_amount', 0)
            .order('created_at', { ascending: false });
    } else if (filter === 'URGENT') {
        // Urgent = is_urgent AND not closed AND not overdue (>10 days)
        const tenDaysAgo = new Date();
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
        query = query
            .eq('is_urgent', true)
            .not('status', 'in', `(${CLOSED_STATUSES.join(',')})`)
            .gte('created_at', tenDaysAgo.toISOString())
            .order('created_at', { ascending: false });
    } else if (filter === 'UNASSIGNED') {
        // Unassigned = sales_agent is NULL (not assigned to anyone yet)
        query = query
            .is('sales_agent', null)
            .order('created_at', { ascending: false });
    } else if (filter !== 'ALL') {
        // Direct status filter (NEW_ORDER, IN_PRODUCTION, etc.)
        query = query.eq('status', filter);
        query = query.order('created_at', { ascending: false });
    } else {
        query = query.order('created_at', { ascending: false });
    }

    // Apply search (server-side ilike across multiple columns)
    if (search) {
        query = query.or(
            `customer_name.ilike.%${search}%,order_number.ilike.%${search}%,customer_email.ilike.%${search}%,customer_phone.ilike.%${search}%,design_name.ilike.%${search}%,sales_agent.ilike.%${search}%`
        );
    }

    // PAYMENT_PENDING needs client-side filtering for the amount comparison
    // Fetch all matching rows, filter, then manually paginate
    if (filter === 'PAYMENT_PENDING') {
        const { data, error, count } = await query;
        if (error) throw new Error(error.message);

        const allOrders = (data || []).map(mapDbToOrder);
        const pendingOrders = allOrders.filter(o => {
            const orderAmount = Number(o.orderAmount) || 0;
            const amountPaid = Number(o.amountPaid) || 0;
            return Math.max(0, orderAmount - amountPaid) > 0.01;
        });

        const paginated = pendingOrders.slice(from, to + 1);
        return { orders: paginated, totalCount: pendingOrders.length };
    }

    // Apply pagination for all other filters
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    return {
        orders: (data || []).map(mapDbToOrder),
        totalCount: count || 0,
    };
}

// ============================================
// SERVER-SIDE QUERY: Fetch tab counts (lightweight)
// ============================================
interface TabCounts {
    total: number;
    urgent: number;
    overdue: number;
    unassigned: number;
    byStatus: Record<string, number>;
    paymentPending: number;
}

async function fetchTabCounts(): Promise<TabCounts> {
    // Single query: fetch only status, is_urgent, created_at, order_amount, amount_paid, sales_agent
    // This is lightweight — no large text fields
    const { data, error } = await supabase
        .from('orders')
        .select('status, is_urgent, created_at, order_amount, amount_paid, sales_agent');

    if (error) throw new Error(error.message);

    const rows = data || [];
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

    const byStatus: Record<string, number> = {};
    let urgent = 0;
    let overdue = 0;
    let unassigned = 0;
    let paymentPending = 0;

    for (const row of rows) {
        // Count by status
        byStatus[row.status] = (byStatus[row.status] || 0) + 1;

        const isClosed = CLOSED_STATUSES.includes(row.status);
        const createdAt = new Date(row.created_at);
        const isOverdue = !isClosed && createdAt < tenDaysAgo;

        if (isOverdue) overdue++;
        if (row.is_urgent && !isClosed && !isOverdue) urgent++;

        // Count unassigned orders
        if (!row.sales_agent) unassigned++;

        // Payment pending
        if (!isClosed && row.status !== 'CANCELLED' && row.status !== 'REFUNDED') {
            const orderAmount = Number(row.order_amount) || 0;
            const amountPaid = Number(row.amount_paid) || 0;
            if (Math.max(0, orderAmount - amountPaid) > 0.01) paymentPending++;
        }
    }

    return {
        total: rows.length,
        urgent,
        overdue,
        unassigned,
        byStatus,
        paymentPending,
    };
}


// ============================================
// COMPONENT
// ============================================
const AllOrdersPage: React.FC = () => {
    const { user, role, permissions } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState<string>('ALL');
    const [currentPage, setCurrentPage] = useState(1);
    const [dateView, setDateView] = useState<'today' | 'week' | 'month' | 'custom'>('month');
    const [customDateRange, setCustomDateRange] = useState<DateRange | null>(null);

    const activeDateRange = React.useMemo(() => {
        if (dateView === 'custom' && customDateRange) return customDateRange;
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const pad = (n: number) => String(n).padStart(2, '0');
        const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        if (dateView === 'today') {
            const today = fmt(now);
            return { startDate: today, endDate: today };
        } else if (dateView === 'week') {
            const start = new Date(now); start.setDate(now.getDate() - 7);
            return { startDate: fmt(start), endDate: fmt(now) };
        } else {
            const start = new Date(year, month, 1);
            const end = new Date(year, month + 1, 0);
            return { startDate: fmt(start), endDate: fmt(end) };
        }
    }, [dateView, customDateRange]);

    const handleCustomDateChange = (range: DateRange) => {
        setCustomDateRange(range);
        setDateView('custom');
        setCurrentPage(1);
    };

    // Debounce search by 300ms to avoid hammering the DB on every keystroke
    const debouncedSearch = useDebouncedValue(searchQuery, 300);

    // --- URL PARAMS FOR DRILL-DOWN ---
    const salesAgentParam = searchParams.get('salesAgent') || undefined;
    const leadSourceParam = searchParams.get('leadSource') || undefined;
    const dateParam = searchParams.get('date') || undefined;
    const idsParam = searchParams.get('ids') || undefined;
    const searchParam = searchParams.get('search') || undefined;

    const canViewFinancials = role === UserRole.ADMIN || permissions?.orders_edit_financials || permissions?.view_financials;

    // --- URL AUTO-FILTER ---
    useEffect(() => {
        const filterParam = searchParams.get('filter');
        if (filterParam) {
            setActiveFilter(filterParam);
            setCurrentPage(1);
        }
    }, [searchParams]);

    // --- URL SEARCH PARAMETER ---
    useEffect(() => {
        if (searchParam) {
            setSearchQuery(searchParam);
        }
    }, [searchParam]);

    // Reset to page 1 only when search or date view changes
    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearch]);

    useEffect(() => {
        setCurrentPage(1);
    }, [dateView, activeDateRange.startDate, activeDateRange.endDate]);

    // ============================================
    // QUERY 1: Tab counts (lightweight, cached separately)
    // ============================================
    const { data: counts } = useQuery({
        queryKey: queryKeys.orders.counts(),
        queryFn: fetchTabCounts,
        staleTime: 1000 * 60, // 60 seconds — counts don't need to be super fresh
        gcTime: 1000 * 60 * 5,
        refetchOnWindowFocus: true,
    });

    // ============================================
    // QUERY 2: Paginated orders (the actual page data)
    // ============================================
    const queryParams = {
        page: currentPage,
        filter: activeFilter,
        search: debouncedSearch,
        salesAgent: salesAgentParam,
        leadSource: leadSourceParam,
        date: dateParam,
        ids: idsParam,
        userRole: role,
        userEmail: user?.email || null,
        dateRangeStart: dateParam ? undefined : activeDateRange.startDate,
        dateRangeEnd: dateParam ? undefined : activeDateRange.endDate,
    };

    const { data: pageData, isLoading, isFetching, error } = useQuery({
        queryKey: queryKeys.orders.paginated(queryParams),
        queryFn: () => fetchPaginatedOrders(queryParams),
        staleTime: 1000 * 30, // 30s — revisiting same filter/page serves from cache instantly
        gcTime: 1000 * 60 * 5,
        refetchOnMount: true,
        refetchOnWindowFocus: true,
        placeholderData: keepPreviousData, // Keep showing old page while new page loads
    });

    const orders = pageData?.orders || [];
    const totalCount = pageData?.totalCount || 0;
    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

    // --- OVERDUE HELPER (for rendering badges) ---
    const isOrderOverdue = (order: Order) => {
        const daysOpen = Math.floor((new Date().getTime() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60 * 24));
        return daysOpen > 10 && !CLOSED_STATUSES.includes(order.status);
    };

    const getCount = (status: string) => counts?.byStatus?.[status] || 0;

    const clearDrillDown = () => {
        setSearchParams({});
        setSearchQuery('');
        setActiveFilter('ALL');
    };

    const handleFilterChange = useCallback((filter: string) => {
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('ids');
        setSearchParams(newParams);
        setActiveFilter(filter);
        setCurrentPage(1);
    }, [searchParams, setSearchParams]);

    // --- SKELETON LOADING (only on initial load, not page transitions) ---
    if (isLoading && !pageData) return (
        <div className="space-y-6 min-h-screen pb-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div><Skeleton width={150} height={36} className="mb-2" /><Skeleton width={300} height={20} /></div>
                <Skeleton width={140} height={48} className="rounded-xl" />
            </div>
            <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-4 space-y-4">
                <Skeleton width="100%" height={48} className="rounded-xl" />
                <div className="flex gap-2"><Skeleton width={100} height={36} className="rounded-lg" /><Skeleton width={100} height={36} className="rounded-lg" /><Skeleton width={100} height={36} className="rounded-lg" /></div>
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
                <div className="flex items-center gap-3 flex-wrap">
                    <ToggleButtons view={dateView} onViewChange={(v) => { setDateView(v); setCurrentPage(1); }} />
                    <DateRangeFilter
                        value={dateView === 'custom' ? customDateRange || undefined : undefined}
                        onChange={handleCustomDateChange}
                    />
                    <span className="text-xs text-slate-400 hidden sm:inline">
                        {activeDateRange.startDate === activeDateRange.endDate
                            ? new Date(activeDateRange.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : `${new Date(activeDateRange.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(activeDateRange.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                        }
                    </span>
                    <Link to="/new-order">
                        <Button variant="primary" size="lg" className="shadow-lg shadow-brand-orange/20 text-white font-semibold">
                            <Plus className="w-5 h-5 mr-2" />
                            New Order
                        </Button>
                    </Link>
                </div>
            </div>

            {/* --- CONTROLS BAR --- */}
            <SpotlightCard className="p-4 space-y-4">

                {/* Active Filters Banner */}
                {(salesAgentParam || leadSourceParam || dateParam) && (
                    <div className="flex items-center justify-between bg-brand-orange/10 border border-brand-orange/20 px-4 py-2 rounded-xl">
                        <div className="flex items-center gap-2 text-sm text-brand-orange">
                            <span className="font-bold">Active Filter:</span>
                            {salesAgentParam && <span>Agent: {salesAgentParam}</span>}
                            {leadSourceParam && <span>Source: {leadSourceParam}</span>}
                            {dateParam && <span>Date: {new Date(dateParam).toLocaleDateString()}</span>}
                        </div>
                        <button onClick={clearDrillDown} className="text-slate-400 hover:text-white focus-ring rounded" aria-label="Clear filters">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="Search by Order ID, Name, Design, Phone (e.g. 300123), or Email..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-slate-800/50 border border-slate-600 text-white text-sm rounded-xl pl-10 pr-4 py-3 focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange transition-all placeholder-slate-400 focus-ring"
                    />
                    {debouncedSearch && (
                        <span className="absolute right-10 top-1/2 -translate-y-1/2 text-xs text-slate-500 hidden sm:inline">
                            searching all time
                        </span>
                    )}
                    {/* Fetching indicator */}
                    {isFetching && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <div className="w-4 h-4 border-2 border-brand-orange/30 border-t-brand-orange rounded-full animate-spin" />
                        </div>
                    )}
                </div>

                {/* EXPANDED FILTER TABS */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
                    <FilterTab active={activeFilter === 'ALL'} label="All Orders" count={counts?.total || 0} onClick={() => handleFilterChange('ALL')} />
                    <FilterTab active={activeFilter === 'URGENT'} label="Urgent" count={counts?.urgent || 0} onClick={() => handleFilterChange('URGENT')} isUrgent={true} />
                    <FilterTab active={activeFilter === 'OVERDUE'} label="Overdue" count={counts?.overdue || 0} onClick={() => handleFilterChange('OVERDUE')} isUrgent={true} />
                    <FilterTab active={activeFilter === 'UNASSIGNED'} label="Unassigned" count={counts?.unassigned || 0} onClick={() => handleFilterChange('UNASSIGNED')} isUrgent={true} />

                    <div className="w-px h-6 bg-slate-600 mx-2 shrink-0" />

                    <FilterTab active={activeFilter === 'NEW_ORDER'} label="New" count={getCount('NEW_ORDER')} onClick={() => handleFilterChange('NEW_ORDER')} />
                    <FilterTab active={activeFilter === 'AWAITING_CUSTOMER_APPROVAL'} label="Awaiting Approval" count={getCount('AWAITING_CUSTOMER_APPROVAL')} onClick={() => handleFilterChange('AWAITING_CUSTOMER_APPROVAL')} />
                    <FilterTab active={activeFilter === 'IN_PRODUCTION'} label="In Production" count={getCount('IN_PRODUCTION')} onClick={() => handleFilterChange('IN_PRODUCTION')} />
                    <FilterTab active={activeFilter === 'REVISION_REQUESTED'} label="Revision" count={getCount('REVISION_REQUESTED')} onClick={() => handleFilterChange('REVISION_REQUESTED')} />

                    <div className="w-px h-6 bg-slate-600 mx-2 shrink-0" />

                    <FilterTab active={activeFilter === 'SHIPPED'} label="Shipped" count={getCount('SHIPPED')} onClick={() => handleFilterChange('SHIPPED')} />
                    <FilterTab active={activeFilter === 'DELIVERED'} label="Delivered" count={getCount('DELIVERED')} onClick={() => handleFilterChange('DELIVERED')} />
                    <FilterTab active={activeFilter === 'QUALITY_ASSURANCE'} label="Quality Assurance" count={getCount('QUALITY_ASSURANCE')} onClick={() => handleFilterChange('QUALITY_ASSURANCE')} />
                    <FilterTab active={activeFilter === 'CANCELLED'} label="Cancelled" count={getCount('CANCELLED')} onClick={() => handleFilterChange('CANCELLED')} />
                    <FilterTab active={activeFilter === 'REFUNDED'} label="Refunds" count={getCount('REFUNDED')} onClick={() => handleFilterChange('REFUNDED')} />
                </div>
            </SpotlightCard>

            {/* --- ORDERS LIST --- */}
            <div className="space-y-3">
                <AnimatePresence mode="wait">
                    {orders.length === 0 && !isFetching ? (
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
                    ) : (orders.map((order, index) => {
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
                                                <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-xl font-bold shadow-md ${isOverdue || order.isUrgent ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
                                                    }`}>
                                                    {order.customerName.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-white font-bold text-lg group-hover:text-brand-orange transition-colors">
                                                            {order.customerName}
                                                        </span>
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
                                                        {order.designName && (
                                                            <>
                                                                <span className="w-1 h-1 rounded-full bg-slate-500" />
                                                                <span className="text-slate-400">{order.designName}</span>
                                                            </>
                                                        )}
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

                                                <div className="flex flex-col items-end min-w-[140px]">
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

                                                {/* PENDING COLUMN */}
                                                <div className="flex flex-col items-end min-w-[90px]">
                                                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1">Pending</span>
                                                    {canViewFinancials ? (
                                                        (order.amountRemaining ?? 0) <= 0.01 ? (
                                                            <span className="inline-flex items-center gap-1 text-green-400">
                                                                <CheckCircle className="w-4 h-4" />
                                                                <span className="text-xs font-bold">Paid</span>
                                                            </span>
                                                        ) : (
                                                            <span className="text-amber-400 font-bold text-base tracking-tight">
                                                                ${(order.amountRemaining ?? 0).toLocaleString()}
                                                            </span>
                                                        )
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
                        <span className="text-slate-500 ml-2">({totalCount} orders)</span>
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
