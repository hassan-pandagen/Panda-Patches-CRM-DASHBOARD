// src/pages/CompaniesPage.tsx
// B2B intelligence: groups customers into COMPANY accounts by email domain (the "Accounts +
// Contacts" model), surfaces repeat resellers, and reports monthly Agency-vs-Personal split.
import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import Spinner from '../components/ui/Spinner';
import {
  Building2, Search, X, Users, DollarSign, Repeat, Trophy,
  ArrowUpDown, ArrowUp, ArrowDown, ExternalLink, ChevronLeft, ChevronRight,
} from 'lucide-react';

const PAGE_SIZE = 15;
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import {
  classifySegment, buildCompanyAccounts, buildPersonalCustomers, buildMonthlySegments, type CompanyAccount, type OrderLike,
} from '../utils/customerSegment';
import ToggleButtons, { type DateViewOption } from '../components/ui/ToggleButtons';
import DateRangeFilter, { type DateRange } from '../components/ui/DateRangeFilter';

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString()}`;
const formatDateOnly = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

type SortKey = 'company' | 'orders' | 'contacts' | 'revenue' | 'avgOrder' | 'lastOrder';

const CompaniesPage: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [repeatOnly, setRepeatOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  // Segment switch driven by the chart legend: 'both' = compare; click a series to focus it,
  // which also switches the list below between companies (Business) and individuals (Personal).
  const [focusSegment, setFocusSegment] = useState<'both' | 'business' | 'personal'>('both');

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['companies-orders'],
    queryFn: async (): Promise<OrderLike[]> => {
      const { data, error } = await supabase
        .from('orders')
        .select('customer_email, customer_name, order_amount, created_at, order_number')
        .not('customer_email', 'is', null);
      if (error) throw error;
      return (data || []) as OrderLike[];
    },
    staleTime: 60_000,
  });

  // ── Date-range filter (same presets + calendar as Reports) ──
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const y = new Date().getFullYear();
    return { startDate: `${y}-01-01`, endDate: `${y}-12-31` };
  });
  const [dateView, setDateView] = useState<string>('year');

  const handleDateViewChange = (v: DateViewOption) => {
    const now = new Date(); const year = now.getFullYear(); const month = now.getMonth();
    if (v === 'last-month') { const s = new Date(year, month - 1, 1); const e = new Date(year, month, 0); setDateRange({ startDate: formatDateOnly(s), endDate: formatDateOnly(e) }); setDateView('last-month'); }
    else if (v === 'quarter') { const s = new Date(year, Math.floor(month / 3) * 3, 1); const e = new Date(year, Math.floor(month / 3) * 3 + 3, 0); setDateRange({ startDate: formatDateOnly(s), endDate: formatDateOnly(e) }); setDateView('quarter'); }
    else if (v === 'year') { setDateRange({ startDate: `${year}-01-01`, endDate: `${year}-12-31` }); setDateView('year'); }
    else if (v === 'today') { const t = formatDateOnly(now); setDateRange({ startDate: t, endDate: t }); setDateView('today'); }
    else if (v === 'week') { const s = new Date(year, month, now.getDate() - 7); setDateRange({ startDate: formatDateOnly(s), endDate: formatDateOnly(now) }); setDateView('week'); }
    else if (v === 'month') { const s = new Date(year, month, 1); const e = new Date(year, month + 1, 0); setDateRange({ startDate: formatDateOnly(s), endDate: formatDateOnly(e) }); setDateView('month'); }
    else setDateView(v);
  };
  const activeMonth = dateRange.startDate.substring(0, 7);
  const handlePrevMonth = () => { const [y, m] = dateRange.startDate.split('-').map(Number); const s = new Date(y, m - 2, 1); const e = new Date(y, m - 1, 0); setDateRange({ startDate: formatDateOnly(s), endDate: formatDateOnly(e) }); setDateView('custom'); };
  const handleNextMonth = () => { const [y, m] = dateRange.startDate.split('-').map(Number); const s = new Date(y, m, 1); const e = new Date(y, m + 1, 0); setDateRange({ startDate: formatDateOnly(s), endDate: formatDateOnly(e) }); setDateView('custom'); };
  const handleCustomDateRange = (range: DateRange) => { setDateRange(range); setDateView('custom'); };

  const filteredOrders = useMemo(() => {
    const startMs = new Date(`${dateRange.startDate}T00:00:00`).getTime();
    const endMs = new Date(`${dateRange.endDate}T23:59:59.999`).getTime();
    return orders.filter((o) => {
      if (!o.created_at) return false;
      const t = new Date(o.created_at).getTime();
      return t >= startMs && t <= endMs;
    });
  }, [orders, dateRange]);

  const companyAccounts = useMemo(() => buildCompanyAccounts(filteredOrders), [filteredOrders]);
  const personalCustomers = useMemo(() => buildPersonalCustomers(filteredOrders), [filteredOrders]);
  const isPersonalView = focusSegment === 'personal';
  const accounts = isPersonalView ? personalCustomers : companyAccounts;
  const monthly = useMemo(() => buildMonthlySegments(filteredOrders, 12), [filteredOrders]);

  // Summary stats over the selected range
  const stats = useMemo(() => {
    let b2bRev = 0, b2bOrders = 0, b2cRev = 0, b2cOrders = 0;
    for (const o of filteredOrders) {
      const amt = Number(o.order_amount) || 0;
      if (classifySegment(o.customer_email) === 'Business') { b2bRev += amt; b2bOrders += 1; }
      else { b2cRev += amt; b2cOrders += 1; }
    }
    const top = accounts.reduce<CompanyAccount | null>((m, a) => (!m || a.revenue > m.revenue ? a : m), null);
    return {
      repeatCount: accounts.filter((a) => a.orders > 1).length,
      totalAccounts: accounts.length,
      b2bRev: Math.round(b2bRev), b2bOrders,
      b2cRev: Math.round(b2cRev), b2cOrders,
      top,
    };
  }, [filteredOrders, accounts]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = accounts.filter((a) => {
      if (repeatOnly && a.orders <= 1) return false;
      if (!q) return true;
      return a.company.toLowerCase().includes(q)
        || a.domain.toLowerCase().includes(q)
        || a.contactNames.some((n) => n.toLowerCase().includes(q));
    });
    arr = [...arr].sort((a, b) => {
      let av: number | string; let bv: number | string;
      if (sortKey === 'company') { av = a.company.toLowerCase(); bv = b.company.toLowerCase(); }
      else if (sortKey === 'lastOrder') { av = new Date(a.lastOrder).getTime(); bv = new Date(b.lastOrder).getTime(); }
      else { av = a[sortKey]; bv = b[sortKey]; }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [accounts, search, repeatOnly, sortKey, sortDir]);

  // Pagination (matches the Orders page)
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  // Jump back to page 1 whenever the result set changes (filter/search/sort/view)
  useEffect(() => { setPage(1); }, [search, repeatOnly, focusSegment, dateRange, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'company' ? 'asc' : 'desc'); }
  };

  const Th: React.FC<{ label: string; k: SortKey; right?: boolean }> = ({ label, k, right }) => (
    <th
      onClick={() => toggleSort(k)}
      className={`px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors ${right ? 'text-right' : 'text-left'}`}
    >
      <span className={`inline-flex items-center gap-1 ${right ? 'flex-row-reverse' : ''}`}>
        {label}
        {sortKey === k
          ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-brand-orange" /> : <ArrowDown className="w-3 h-3 text-brand-orange" />)
          : <ArrowUpDown className="w-3 h-3 opacity-30" />}
      </span>
    </th>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Building2 className="w-6 h-6 text-brand-orange" />
            Companies &amp; Accounts
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Customers grouped by company (email domain) — find your repeat resellers and agency accounts.
            <span className="text-slate-500"> Business = custom domain · Personal = gmail/yahoo/etc.</span>
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
          <ToggleButtons
            view={dateView}
            onViewChange={handleDateViewChange}
            activeMonth={activeMonth}
            onPrevMonth={handlePrevMonth}
            onNextMonth={handleNextMonth}
          />
          <DateRangeFilter value={dateRange} onChange={handleCustomDateRange} />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Repeat className="w-5 h-5 text-emerald-400" />} label={isPersonalView ? 'Repeat Customers' : 'Repeat Companies'}
          value={String(stats.repeatCount)} sub={`${stats.totalAccounts} ${isPersonalView ? 'customers' : 'business accounts'} total`} />
        <StatCard icon={<DollarSign className="w-5 h-5 text-brand-orange" />} label="Agency Revenue"
          value={fmtMoney(stats.b2bRev)} sub={`${stats.b2bOrders} orders`} />
        <StatCard icon={<Users className="w-5 h-5 text-sky-400" />} label="Personal Revenue"
          value={fmtMoney(stats.b2cRev)} sub={`${stats.b2cOrders} orders`} />
        <StatCard icon={<Trophy className="w-5 h-5 text-amber-400" />} label={isPersonalView ? 'Top Customer' : 'Top Account'}
          value={stats.top?.company ?? '—'} sub={stats.top ? `${fmtMoney(stats.top.revenue)} · ${stats.top.orders} orders` : ''} />
      </div>

      {/* Monthly Agency vs Personal report */}
      <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-white mb-1">Monthly — Agency vs Personal</h3>
        <p className="text-xs text-slate-400 mb-4">Revenue split by customer type. <span className="text-slate-500">Click a series in the legend to focus it — the list below switches between companies and individual customers.</span></p>
        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthly} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
              <XAxis dataKey="label" stroke="#cbd5e1" style={{ fontSize: '12px' }} />
              <YAxis stroke="#cbd5e1" style={{ fontSize: '12px' }}
                tickFormatter={(v) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`)} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#fff' }}
                formatter={(value: any, name: any) => [fmtMoney(Number(value)), name]} />
              <Legend
                wrapperStyle={{ fontSize: '12px', cursor: 'pointer' }}
                payload={[
                  { value: 'Business / Agency', type: 'square', id: 'business', color: focusSegment === 'personal' ? '#475569' : '#FB6E1D' },
                  { value: 'Personal', type: 'square', id: 'personal', color: focusSegment === 'business' ? '#334155' : '#94a3b8' },
                ]}
                onClick={(o: any) => {
                  const seg = (o?.id === 'personal' || o?.value === 'Personal') ? 'personal' : 'business';
                  setFocusSegment((cur) => (cur === seg ? 'both' : seg));
                }}
                formatter={(value: string) => {
                  const seg = value === 'Personal' ? 'personal' : 'business';
                  const dim = focusSegment !== 'both' && focusSegment !== seg;
                  return <span style={{ color: dim ? '#64748b' : '#cbd5e1', userSelect: 'none' }}>{value}</span>;
                }}
              />
              <Bar dataKey="b2bRevenue" name="Business / Agency" fill="#FB6E1D" radius={[4, 4, 0, 0]} hide={focusSegment === 'personal'} />
              <Bar dataKey="b2cRevenue" name="Personal" fill="#475569" radius={[4, 4, 0, 0]} hide={focusSegment === 'business'} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text" placeholder="Search company, domain, or buyer…" value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-9 py-2.5 bg-slate-800/50 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-orange/50 transition-colors" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          onClick={() => setRepeatOnly((v) => !v)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
            repeatOnly
              ? 'bg-brand-orange/15 border-brand-orange/40 text-brand-orange'
              : 'bg-slate-800/50 border-white/10 text-slate-300 hover:text-white'
          }`}>
          <Repeat className="w-4 h-4" />
          Repeat only
        </button>
      </div>

      {/* Accounts table */}
      <div className="bg-slate-800/50 border border-white/5 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Building2 className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">{search ? 'No matches' : (isPersonalView ? 'No individual customers yet' : 'No business accounts yet')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5 bg-slate-900/30">
                  <Th label={isPersonalView ? 'Customer' : 'Company'} k="company" />
                  <Th label="Orders" k="orders" right />
                  <Th label="Buyers" k="contacts" right />
                  <Th label="Revenue" k="revenue" right />
                  <Th label="Avg Order" k="avgOrder" right />
                  <Th label="Last Order" k="lastOrder" right />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {paged.map((a) => (
                  <tr key={a.domain}
                    onClick={() => a.orderNumbers.length && navigate(`/orders?ids=${encodeURIComponent(a.orderNumbers.join(', '))}`)}
                    className="hover:bg-white/5 transition-colors cursor-pointer"
                    title="View this account's orders">
                    <td className="px-4 py-3">
                      <div className="font-medium text-white flex items-center gap-2">
                        {a.company}
                        {a.orders > 1 && (
                          <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">Repeat</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                        {isPersonalView ? (
                          <span className="text-slate-400">{a.domain}</span>
                        ) : (
                          <a href={`https://${a.domain}`} target="_blank" rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-slate-400 hover:text-brand-orange inline-flex items-center gap-1">
                            {a.domain} <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        {a.contacts > 1 && <span className="text-slate-300">· {a.contactNames.slice(0, 3).join(', ')}{a.contactNames.length > 3 ? '…' : ''}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-white font-semibold">{a.orders}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{a.contacts}</td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-semibold">{fmtMoney(a.revenue)}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{fmtMoney(a.avgOrder)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-slate-300 text-sm">{fmtDate(a.lastOrder)}</div>
                      <div className={`text-[11px] ${a.daysSinceLast > 60 ? 'text-amber-400' : 'text-slate-500'}`}>
                        {a.daysSinceLast === 0 ? 'today' : `${a.daysSinceLast}d ago`}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 pt-1">
          <button
            disabled={safePage === 1}
            onClick={() => setPage((p) => Math.max(p - 1, 1))}
            className="flex items-center gap-1 px-4 py-2 bg-slate-800 border border-slate-600 text-white text-sm rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          <span className="text-slate-300 font-medium text-sm">
            Page <span className="text-white font-bold">{safePage}</span> of {totalPages}
            <span className="text-slate-500 ml-2">({visible.length} {isPersonalView ? 'customers' : 'companies'})</span>
          </span>
          <button
            disabled={safePage === totalPages}
            onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
            className="flex items-center gap-1 px-4 py-2 bg-slate-800 border border-slate-600 text-white text-sm rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      <p className="text-xs text-slate-600">
        Showing {visible.length} {repeatOnly ? 'repeat ' : ''}{isPersonalView ? 'individual customer' : 'business account'}{visible.length === 1 ? '' : 's'}.
        {!isPersonalView && " Note: resellers using a free email (gmail/yahoo) won't group here — that's the one limit of domain-based grouping."}
      </p>
    </div>
  );
};

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string }> = ({ icon, label, value, sub }) => (
  <div className="bg-slate-800/50 border border-white/10 rounded-xl p-4">
    <div className="flex items-center gap-2 text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">
      {icon}{label}
    </div>
    <div className="text-2xl font-bold text-white truncate">{value}</div>
    {sub && <div className="text-xs text-slate-500 mt-0.5 truncate">{sub}</div>}
  </div>
);

export default CompaniesPage;
