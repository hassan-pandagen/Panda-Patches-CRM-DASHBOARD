// src/pages/AllOrdersPage.tsx - SERVER-SIDE PAGINATION & FILTERING

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { localMidnightISO, localNextDayISO } from '../utils/dateFilters';
import BulkActionBar from '../components/orders/BulkActionBar';
import QuickViewDrawer from '../components/orders/QuickViewDrawer';
import SavedFilters from '../components/ui/SavedFilters';
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
    ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ToggleButtons from '../components/ui/ToggleButtons';
import AttributionQualityBadge, { getAttributionQualityFromOrder } from '../components/AttributionQualityBadge';
import DateRangeFilter, { DateRange } from '../components/ui/DateRangeFilter';

const AgentDropdown: React.FC<{ agents: string[]; value: string; onChange: (v: string) => void }> = ({ agents, value, onChange }) => {
    const [open, setOpen] = React.useState(false);
    const [pos, setPos] = React.useState({ top: 0, right: 0 });
    const btnRef = React.useRef<HTMLButtonElement>(null);
    const dropdownRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            const outsideBtn = btnRef.current && !btnRef.current.contains(target);
            const outsideDropdown = dropdownRef.current && !dropdownRef.current.contains(target);
            if (outsideBtn && outsideDropdown) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleOpen = () => {
        if (btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            setPos({ top: r.bottom + window.scrollY + 8, right: window.innerWidth - r.right });
        }
        setOpen(o => !o);
    };

    const label = value ? value.split('@')[0] : 'All Sales Agents';
    const isFiltered = !!value;

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                onClick={handleOpen}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all min-h-[46px] whitespace-nowrap border ${
                    isFiltered
                        ? 'bg-brand-orange/20 border-brand-orange text-brand-orange'
                        : 'bg-slate-800/50 border-brand-orange/40 text-white hover:border-brand-orange hover:bg-slate-800'
                }`}
            >
                <span>{label}</span>
                {isFiltered ? (
                    <span
                        role="button"
                        onClick={(e) => { e.stopPropagation(); onChange(''); setOpen(false); }}
                        className="hover:text-white transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                    </span>
                ) : (
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
                )}
            </button>

            {open && createPortal(
                <div
                    ref={dropdownRef}
                    style={{ position: 'absolute', top: pos.top, right: pos.right }}
                    className="w-64 bg-slate-900 border border-brand-orange/30 rounded-xl shadow-2xl z-[9999] overflow-hidden"
                >
                    <div className="max-h-72 overflow-y-auto py-1">
                        {agents.map(agent => (
                            <button
                                key={agent}
                                type="button"
                                onClick={() => { onChange(agent); setOpen(false); }}
                                className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${value === agent ? 'text-brand-orange bg-brand-orange/10' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
                            >
                                {agent.split('@')[0]}
                                <span className="block text-xs text-slate-500">{agent}</span>
                            </button>
                        ))}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

const FilterTab = React.memo(({ active, label, count, onClick, isUrgent = false }: any) => (
    <button
        onClick={onClick}
        className={`relative px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 whitespace-nowrap min-h-[40px] ${active
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

    const columns = 'id, order_number, customer_name, customer_email, design_name, status, created_at, sales_agent, order_amount, amount_paid, is_urgent, production_completed_at, production_completed_by';

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

    // Production users only see orders that aren't marked production-complete yet
    if (userRole === UserRole.PRODUCTION) {
        query = query.is('production_completed_at', null);
    }

    // Apply drill-down params
    if (salesAgent) query = query.eq('sales_agent', salesAgent);
    if (leadSource) {
        // "Unknown" = orders with no lead_source recorded (NULL or empty string)
        if (leadSource === 'Unknown') {
            query = query.or('lead_source.is.null,lead_source.eq.');
        } else {
            query = query.eq('lead_source', leadSource);
        }
    }
    if (date) {
        // Filter by date (full day range) — single-day drill-down from dashboard
        query = query.gte('created_at', localMidnightISO(date)).lt('created_at', localNextDayISO(date));
    } else if (dateRangeStart && dateRangeEnd && !search) {
        // Date range filter — skipped when search is active so orders from any date are found
        query = query.gte('created_at', localMidnightISO(dateRangeStart)).lt('created_at', localNextDayISO(dateRangeEnd));
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

async function fetchTabCounts(params: {
    salesAgent?: string;
    leadSource?: string;
    dateRangeStart?: string;
    dateRangeEnd?: string;
    userRole?: UserRole | null;
    userEmail?: string | null;
} = {}): Promise<TabCounts> {
    const { salesAgent, leadSource, dateRangeStart, dateRangeEnd, userRole, userEmail } = params;

    // Single query: fetch only status, is_urgent, created_at, order_amount, amount_paid, sales_agent
    // This is lightweight — no large text fields
    let query = supabase
        .from('orders')
        .select('status, is_urgent, created_at, order_amount, amount_paid, sales_agent, production_completed_at');

    // AGENT/USER see only their assigned orders; ADMIN/PRODUCTION see all
    if (userRole !== UserRole.ADMIN && userRole !== UserRole.PRODUCTION && userEmail) {
        query = query.eq('sales_agent', userEmail);
    }

    // Production tab counts also exclude completed
    if (userRole === UserRole.PRODUCTION) {
        query = query.is('production_completed_at', null);
    }

    if (salesAgent) query = query.eq('sales_agent', salesAgent);
    if (leadSource) {
        if (leadSource === 'Unknown') {
            query = query.or('lead_source.is.null,lead_source.eq.');
        } else {
            query = query.eq('lead_source', leadSource);
        }
    }
    if (dateRangeStart && dateRangeEnd) {
        query = query.gte('created_at', localMidnightISO(dateRangeStart)).lt('created_at', localNextDayISO(dateRangeEnd));
    }

    const { data, error } = await query;

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
    const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
    const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
    const [quickViewOrder, setQuickViewOrder] = useState<any>(null);

    const toggleSelect = useCallback((id: string) => {
        setSelectedOrderIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);

    const clearSelection = useCallback(() => setSelectedOrderIds(new Set()), []);

    // --- Persist filters in URL so they survive navigation ---
    const activeFilter = searchParams.get('filter') || 'ALL';
    const currentPage = Number(searchParams.get('page')) || 1;
    const dateView = searchParams.get('dateView') || 'month';
    const customStartParam = searchParams.get('startDate');
    const customEndParam = searchParams.get('endDate');
    const customDateRange: DateRange | null = (customStartParam && customEndParam) ? { startDate: customStartParam, endDate: customEndParam } : null;

    // Helper to update URL params without losing existing ones
    const updateParams = useCallback((updates: Record<string, string | null>) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            for (const [key, val] of Object.entries(updates)) {
                if (val === null || val === undefined) next.delete(key);
                else next.set(key, val);
            }
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    const setActiveFilter = useCallback((f: string) => updateParams({ filter: f === 'ALL' ? null : f, page: null }), [updateParams]);
    const setCurrentPage = useCallback((p: number) => updateParams({ page: p <= 1 ? null : String(p) }), [updateParams]);

    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const setDateView = useCallback((v: string) => {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();

        if (v === 'last-month') {
            const start = new Date(year, month - 1, 1);
            const end = new Date(year, month, 0);
            updateParams({ dateView: 'last-month', startDate: fmt(start), endDate: fmt(end), page: null });
        } else if (v === 'quarter') {
            const qStart = new Date(year, Math.floor(month / 3) * 3, 1);
            const qEnd = new Date(year, Math.floor(month / 3) * 3 + 3, 0);
            updateParams({ dateView: 'quarter', startDate: fmt(qStart), endDate: fmt(qEnd), page: null });
        } else if (v === 'year') {
            updateParams({ dateView: 'year', startDate: `${year}-01-01`, endDate: `${year}-12-31`, page: null });
        } else {
            updateParams({ dateView: v === 'month' ? null : v, page: null, ...(v !== 'custom' ? { startDate: null, endDate: null } : {}) });
        }
    }, [updateParams]);

    const activeDateRange = React.useMemo(() => {
        if ((dateView === 'custom' || dateView === 'last-month' || dateView === 'quarter' || dateView === 'year') && customDateRange) return customDateRange;
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        if (dateView === 'today') {
            const today = fmt(now);
            return { startDate: today, endDate: today };
        } else if (dateView === 'week') {
            const start = new Date(now); start.setDate(now.getDate() - 7);
            return { startDate: fmt(start), endDate: fmt(now) };
        } else {
            // Default: this month
            const start = new Date(year, month, 1);
            const end = new Date(year, month + 1, 0);
            return { startDate: fmt(start), endDate: fmt(end) };
        }
    }, [dateView, customDateRange]);

    const handleCustomDateChange = (range: DateRange) => {
        updateParams({ dateView: 'custom', startDate: range.startDate, endDate: range.endDate, page: null });
    };

    // Month navigation — shift date range by 1 month
    const activeMonth = activeDateRange.startDate.substring(0, 7); // "2026-02"
    const handlePrevMonth = useCallback(() => {
        const [y, m] = activeDateRange.startDate.split('-').map(Number);
        const start = new Date(y, m - 2, 1);
        const end = new Date(y, m - 1, 0);
        updateParams({ dateView: 'custom', startDate: fmt(start), endDate: fmt(end), page: null });
    }, [activeDateRange.startDate, updateParams]);

    const handleNextMonth = useCallback(() => {
        const [y, m] = activeDateRange.startDate.split('-').map(Number);
        const start = new Date(y, m, 1);
        const end = new Date(y, m + 1, 0);
        updateParams({ dateView: 'custom', startDate: fmt(start), endDate: fmt(end), page: null });
    }, [activeDateRange.startDate, updateParams]);

    // Debounce search by 300ms to avoid hammering the DB on every keystroke
    const debouncedSearch = useDebouncedValue(searchQuery, 300);

    // --- URL PARAMS FOR DRILL-DOWN ---
    const salesAgentParam = searchParams.get('salesAgent') || undefined;
    const leadSourceParam = searchParams.get('leadSource') || undefined;
    const dateParam = searchParams.get('date') || undefined;
    const idsParam = searchParams.get('ids') || undefined;
    const searchParam = searchParams.get('search') || undefined;

    const canViewFinancials = role === UserRole.ADMIN || permissions?.orders_edit_financials || permissions?.view_financials;

    // Reset to page 1 when search changes
    const prevSearchRef = useRef(debouncedSearch);
    useEffect(() => {
        if (prevSearchRef.current !== debouncedSearch) {
            prevSearchRef.current = debouncedSearch;
            setCurrentPage(1);
        }
    }, [debouncedSearch, setCurrentPage]);

    // ============================================
    // QUERY 1: Tab counts (lightweight, cached separately)
    // ============================================
    const countsFilterParams = {
        salesAgent: salesAgentParam,
        leadSource: leadSourceParam,
        dateRangeStart: activeDateRange.startDate,
        dateRangeEnd: activeDateRange.endDate,
    };
    const { data: counts } = useQuery({
        queryKey: queryKeys.orders.counts(countsFilterParams),
        queryFn: () => fetchTabCounts({ ...countsFilterParams, userRole: role, userEmail: user?.email }),
        staleTime: 1000 * 60, // 60 seconds — counts don't need to be super fresh
        gcTime: 1000 * 60 * 5,
        refetchOnWindowFocus: false, // realtime subscription already handles fresh data
    });

    // ============================================
    // QUERY 1b: Distinct sales agents for admin dropdown
    // ============================================
    const { data: salesAgents } = useQuery({
        queryKey: ['salesAgents'],
        queryFn: async () => {
            // Agents are staff users — query user_profiles (small table) instead of scanning all orders.
            const { data, error } = await supabase
                .from('user_profiles')
                .select('email')
                .not('email', 'is', null);
            if (error) throw error;
            return (data || [])
                .map((r: any) => r.email as string)
                .filter(Boolean)
                .sort();
        },
        // Staff list changes rarely — keep it cached aggressively
        staleTime: 1000 * 60 * 30,
        gcTime: 1000 * 60 * 60,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        enabled: role === UserRole.ADMIN,
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
        // Only clear drill-down params, preserve date range & filter tab
        updateParams({ salesAgent: null, leadSource: null, date: null, ids: null, search: null, page: null });
        setSearchQuery('');
    };

    const handleFilterChange = useCallback((filter: string) => {
        updateParams({ filter: filter === 'ALL' ? null : filter, ids: null, page: null });
    }, [updateParams]);

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
                    <ToggleButtons
                        view={dateView}
                        onViewChange={setDateView}
                        activeMonth={activeMonth}
                        onPrevMonth={handlePrevMonth}
                        onNextMonth={handleNextMonth}
                    />
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
                    <SavedFilters />
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
                            {salesAgentParam && <span>Agent: {salesAgentParam.split('@')[0]}</span>}
                            {leadSourceParam && <span>Source: {leadSourceParam}</span>}
                            {dateParam && <span>Date: {new Date(dateParam).toLocaleDateString()}</span>}
                        </div>
                        <button onClick={clearDrillDown} className="text-slate-400 hover:text-white focus-ring rounded" aria-label="Clear filters">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* Search + Agent Filter row */}
                <div className="flex gap-3 items-center">
                    {/* Search */}
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                        <input
                            type="text"
                            placeholder="Search by Order ID, Name, Design, Phone (e.g. 300123), or Email..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-800/50 border border-brand-orange/40 text-white text-sm rounded-xl pl-10 pr-4 py-3 focus:ring-2 focus:ring-brand-orange/60 focus:border-brand-orange transition-all placeholder-slate-400"
                        />
                        {debouncedSearch && (
                            <span className="absolute right-10 top-1/2 -translate-y-1/2 text-xs text-slate-500 hidden sm:inline">
                                searching all time
                            </span>
                        )}
                        {isFetching && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                <div className="w-4 h-4 border-2 border-brand-orange/30 border-t-brand-orange rounded-full animate-spin" />
                            </div>
                        )}
                    </div>

                    {/* Sales Agent Filter — admin only */}
                    {role === UserRole.ADMIN && salesAgents && salesAgents.length > 0 && (
                        <AgentDropdown
                            agents={salesAgents}
                            value={salesAgentParam || ''}
                            onChange={(val) => updateParams({ salesAgent: val || null, page: null })}
                        />
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
                    <FilterTab active={activeFilter === 'REMAKE'} label="Remake" count={getCount('REMAKE')} onClick={() => handleFilterChange('REMAKE')} />
                    <FilterTab active={activeFilter === 'CANCELLED'} label="Cancelled" count={getCount('CANCELLED')} onClick={() => handleFilterChange('CANCELLED')} />
                    <FilterTab active={activeFilter === 'REFUNDED'} label="Refunds" count={getCount('REFUNDED')} onClick={() => handleFilterChange('REFUNDED')} />
                </div>
            </SpotlightCard>

            {/* --- ORDERS LIST --- */}
            <div className="space-y-3">
                <AnimatePresence>
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
                                            <div className="flex items-center gap-3 md:gap-4">
                                                {/* Bulk select checkbox */}
                                                <button
                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSelect(order.id); }}
                                                    className={`w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                                        selectedOrderIds.has(order.id)
                                                            ? 'bg-brand-orange border-brand-orange text-white'
                                                            : 'border-slate-600 hover:border-slate-400 opacity-0 group-hover:opacity-100'
                                                    }`}
                                                >
                                                    {selectedOrderIds.has(order.id) && <CheckCircle className="w-4 h-4" />}
                                                </button>
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
                                                        <AttributionQualityBadge
                                                            quality={getAttributionQualityFromOrder(order)}
                                                            size="sm"
                                                            showLabel={false}
                                                        />
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
                                            <div className="flex items-center justify-between md:justify-end gap-4 md:gap-10 mt-2 md:mt-0 border-t md:border-t-0 border-white/5 pt-3 md:pt-0">

                                                <div className="flex flex-col items-start md:items-end md:min-w-[140px]">
                                                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1">Status</span>
                                                    <StatusBadge status={order.status as OrderStatus} />
                                                </div>

                                                <div className="flex flex-col items-center md:items-end md:min-w-[90px]">
                                                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1">Amount</span>
                                                    {canViewFinancials ? (
                                                        <span className="text-white font-bold text-sm md:text-base tracking-tight">${order.orderAmount.toLocaleString()}</span>
                                                    ) : (
                                                        <div className="flex items-center gap-1 text-slate-500">
                                                            <Lock className="w-3 h-3" />
                                                            <span className="text-xs">Hidden</span>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex flex-col items-end md:min-w-[90px]">
                                                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1">Pending</span>
                                                    {canViewFinancials ? (
                                                        (order.amountRemaining ?? 0) <= 0.01 ? (
                                                            <span className="inline-flex items-center gap-1 text-green-400">
                                                                <CheckCircle className="w-4 h-4" />
                                                                <span className="text-xs font-bold">Paid</span>
                                                            </span>
                                                        ) : (
                                                            <span className="text-amber-400 font-bold text-sm md:text-base tracking-tight">
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

                                                {/* Quick view button */}
                                                <button
                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setQuickViewOrder(order); }}
                                                    className="p-2 rounded-lg text-slate-500 hover:text-brand-orange hover:bg-white/10 transition-all opacity-0 group-hover:opacity-100 hidden md:flex items-center justify-center"
                                                    title="Quick view"
                                                >
                                                    <ArrowRight className="w-5 h-5" />
                                                </button>
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
                        onClick={() => setCurrentPage(Math.max(currentPage - 1, 1))}
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
                        onClick={() => setCurrentPage(Math.min(currentPage + 1, totalPages))}
                        className="bg-slate-800 border border-slate-600 text-white hover:bg-slate-700 disabled:opacity-50"
                    >
                        Next <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                </div>
            )}
            {/* Quick View Drawer */}
            <QuickViewDrawer
                order={quickViewOrder}
                isOpen={!!quickViewOrder}
                onClose={() => setQuickViewOrder(null)}
            />

            {/* Bulk Action Bar */}
            <BulkActionBar
                selectedIds={Array.from(selectedOrderIds)}
                selectedOrders={orders.filter(o => selectedOrderIds.has(o.id)).map(o => ({ id: o.id, orderNumber: o.orderNumber }))}
                onClear={clearSelection}
                salesAgents={[
                    { email: 'lance@pandapatches.com', name: 'Lance' },
                    { email: 'hello@pandapatches.com', name: 'Panda Admin' },
                    ...(orders
                        .map(o => o.salesAgent)
                        .filter((v, i, a) => v && a.indexOf(v) === i && v !== 'lance@pandapatches.com' && v !== 'hello@pandapatches.com')
                        .map(email => ({ email: email!, name: email!.split('@')[0] }))
                    )
                ]}
            />
        </div>
    );
};

export default AllOrdersPage;
