// FunnelAttributionReport — answers 3 specific business questions:
//   1. How many quotes are converting to orders?
//   2. Which agents are bypassing the quote flow (creating orders for customers
//      who already had a quote in the system)?
//   3. What quality of data did Meta receive via CAPI in the selected period?
//
// Powered by:
//   - orders.converted_from_quote_id / converted_from_quote_number
//   - orders.had_prior_quote_request
//   - orders.attribution_quality (generated column)
//   - orders.capi_purchase_sent + capi_purchase_sent_at

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import Spinner from '../ui/Spinner';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ComposedChart, Line } from 'recharts';
import { Shield, ShieldAlert, ShieldOff, TrendingUp, AlertCircle, Send, Calendar, BarChart2 } from 'lucide-react';

interface Props {
  startDate?: Date | null;
  endDate?: Date | null;
}

interface CapiLeadEvent {
  event_name: 'Lead' | 'InitiateCheckout';
  event_id: string;
  fired_at: string;
  action_source: string;
  success: boolean;
}

interface OrderRow {
  id: number;
  order_number: string;
  customer_name: string | null;
  customer_email: string | null;
  sales_agent: string | null;
  attribution_quality: 'tracked' | 'partial' | 'untracked' | null;
  attribution: Record<string, any> | null;
  capi_purchase_sent: boolean | null;
  capi_purchase_sent_at: string | null;
  capi_lead_events: CapiLeadEvent[] | null;
  lead_source: string | null;
  converted_from_quote_id: number | null;
  had_prior_quote_request: boolean | null;
  order_amount: number | null;
  created_at: string;
}

interface QuoteRow {
  id: number;
  customer_email: string | null;
  created_at: string;
  sales_agent: string | null;
}

const FunnelAttributionReport: React.FC<Props> = ({ startDate, endDate }) => {
  const navigate = useNavigate();

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['funnel-orders', startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      let q = supabase
        .from('orders')
        .select('id, order_number, customer_name, customer_email, sales_agent, lead_source, attribution_quality, attribution, capi_purchase_sent, capi_purchase_sent_at, capi_lead_events, converted_from_quote_id, had_prior_quote_request, order_amount, created_at')
        .order('created_at', { ascending: false });
      if (startDate) q = q.gte('created_at', startDate.toISOString());
      if (endDate)   q = q.lte('created_at', endDate.toISOString());
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as OrderRow[];
    },
    staleTime: 60_000,
  });

  const { data: quotes = [], isLoading: quotesLoading } = useQuery({
    queryKey: ['funnel-quotes', startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      let q = supabase
        .from('quotes')
        .select('id, customer_email, created_at, sales_agent');
      if (startDate) q = q.gte('created_at', startDate.toISOString());
      if (endDate)   q = q.lte('created_at', endDate.toISOString());
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as QuoteRow[];
    },
    staleTime: 60_000,
  });

  // ── ALL-TIME monthly trend (separate from period filter) ─────
  // Shows whether agents are adopting the Convert flow over time.
  // Uses an RPC because the raw-row approach hits PostgREST's 1000-row default
  // limit on busy months (May 590 quotes → only 5 came back).
  const { data: trendData = [] } = useQuery({
    queryKey: ['funnel-monthly-trend'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_funnel_monthly_trend', { months_back: 6 });
      if (error) throw error;
      return (data || []).map((r: any) => ({
        month:          r.month,
        quotes_created: Number(r.quotes_created),
        orders:         Number(r.orders),
        converted:      Number(r.converted),
        bypassed:       Number(r.bypassed),
        tracked:        Number(r.tracked),
      }));
    },
    staleTime: 5 * 60_000,
  });

  // ── Funnel metrics ─────────────────────────────────────────────
  const funnel = useMemo(() => {
    const totalQuotes = quotes.length;
    const totalOrders = orders.length;
    const convertedViaButton = orders.filter(o => o.converted_from_quote_id != null).length;
    const bypassedQuote = orders.filter(o => o.had_prior_quote_request && o.converted_from_quote_id == null).length;
    const newOrdersNoQuote = orders.filter(o => !o.had_prior_quote_request).length;
    const conversionRate = totalQuotes > 0 ? ((convertedViaButton / totalQuotes) * 100) : 0;
    return { totalQuotes, totalOrders, convertedViaButton, bypassedQuote, newOrdersNoQuote, conversionRate };
  }, [quotes, orders]);

  // ── Bypass leaderboard (agents who bypassed quotes) ──────────
  const bypassLeaderboard = useMemo(() => {
    const map = new Map<string, number>();
    orders.forEach(o => {
      if (o.had_prior_quote_request && o.converted_from_quote_id == null && o.sales_agent) {
        map.set(o.sales_agent, (map.get(o.sales_agent) ?? 0) + 1);
      }
    });
    return Array.from(map.entries())
      .map(([agent, count]) => ({ agent, count }))
      .sort((a, b) => b.count - a.count);
  }, [orders]);

  // ── CAPI quality breakdown ───────────────────────────────────
  const capiQuality = useMemo(() => {
    const sent = orders.filter(o => o.capi_purchase_sent);
    const tracked   = sent.filter(o => o.attribution_quality === 'tracked').length;
    const partial   = sent.filter(o => o.attribution_quality === 'partial').length;
    const untracked = sent.filter(o => o.attribution_quality === 'untracked').length;
    const totalValue = sent.reduce((s, o) => s + Number(o.order_amount ?? 0), 0);
    return { sent: sent.length, tracked, partial, untracked, totalValue };
  }, [orders]);

  // ── Lead source conversion table ────────────────────────────
  const leadSourceStats = useMemo(() => {
    const map = new Map<string, { orders: number; paid: number; revenue: number; amounts: number[] }>();
    orders.forEach(o => {
      const src = o.lead_source || 'Unknown';
      const cur = map.get(src) ?? { orders: 0, paid: 0, revenue: 0, amounts: [] };
      cur.orders++;
      const amt = Number(o.order_amount ?? 0);
      if (amt > 0) cur.amounts.push(amt);
      cur.revenue += amt;
      map.set(src, cur);
    });
    return Array.from(map.entries())
      .map(([source, s]) => ({
        source,
        orders: s.orders,
        revenue: s.revenue,
        avg: s.amounts.length > 0 ? s.revenue / s.amounts.length : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [orders]);

  const [lsSortKey, setLsSortKey] = useState<'revenue' | 'orders' | 'avg'>('revenue');
  const sortedLeadSources = useMemo(() =>
    [...leadSourceStats].sort((a, b) => b[lsSortKey] - a[lsSortKey]),
    [leadSourceStats, lsSortKey]
  );

  // ── CAPI events per day ──────────────────────────────────────
  const capiByDay = useMemo(() => {
    const map = new Map<string, { date: string; tracked: number; partial: number; untracked: number }>();
    orders.forEach(o => {
      if (!o.capi_purchase_sent_at) return;
      const day = o.capi_purchase_sent_at.slice(0, 10);
      const cur = map.get(day) ?? { date: day, tracked: 0, partial: 0, untracked: 0 };
      const q = o.attribution_quality ?? 'untracked';
      if (q === 'tracked') cur.tracked++;
      else if (q === 'partial') cur.partial++;
      else cur.untracked++;
      map.set(day, cur);
    });
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [orders]);

  if (ordersLoading || quotesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Top stat cards ──────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Quotes → Orders"
          value={`${funnel.convertedViaButton} / ${funnel.totalQuotes}`}
          sub={`${funnel.conversionRate.toFixed(1)}% conversion rate`}
          color="emerald"
        />
        <StatCard
          icon={<AlertCircle className="w-5 h-5" />}
          label="Agents Bypassed Quote"
          value={String(funnel.bypassedQuote)}
          sub="Customer had a quote, agent created order anyway"
          color="amber"
        />
        <StatCard
          icon={<Shield className="w-5 h-5" />}
          label="Tracked CAPI Events"
          value={String(capiQuality.tracked)}
          sub={`of ${capiQuality.sent} sent to Meta`}
          color="emerald"
        />
        <StatCard
          icon={<ShieldOff className="w-5 h-5" />}
          label="Untracked CAPI Events"
          value={String(capiQuality.untracked)}
          sub="No fbc/fbp/utm — low EMQ"
          color="red"
        />
      </div>

      {/* ── 12-month adoption trend ────────────────────────── */}
      <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-lg font-semibold text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-brand-orange" />
              Quote → Order Adoption (Last 6 Months)
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Watch agents adopt the Convert to Order flow over time.
              Green bars = good behavior, amber bars = bypass behavior.
            </p>
          </div>
        </div>
        {trendData.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">No data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="month" stroke="#94a3b8" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" stroke="#94a3b8" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis yAxisId="right" orientation="right" stroke="#60a5fa" tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar yAxisId="left" dataKey="converted" stackId="ord" fill="#10b981" name="🟢 Quote → Order (via button)" />
              <Bar yAxisId="left" dataKey="bypassed"  stackId="ord" fill="#f59e0b" name="🟡 Quote → Order (manual / no button)" />
              <Line yAxisId="right" type="monotone" dataKey="quotes_created" stroke="#60a5fa" strokeWidth={2} dot={{ r: 4 }} name="📝 Quotes created (right axis)" />
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {/* Compact data table below chart */}
        {trendData.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-slate-400 uppercase text-[10px] tracking-wider">
                <tr className="border-b border-white/5">
                  <th className="px-3 py-2">Month</th>
                  <th className="px-3 py-2 text-right">Quotes</th>
                  <th className="px-3 py-2 text-right">Orders</th>
                  <th className="px-3 py-2 text-right text-emerald-400">Quote → Order</th>
                  <th className="px-3 py-2 text-right text-blue-400">Conv. Rate</th>
                  <th className="px-3 py-2 text-right text-amber-400">Used Button</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {[...trendData].reverse().map((row) => {
                  // Real business conversion = customers who quoted AND ordered
                  // (whether or not the agent used the "Convert to Order" button)
                  const realConversions = row.converted + row.bypassed;
                  const convRate = row.quotes_created > 0
                    ? ((realConversions / row.quotes_created) * 100).toFixed(1)
                    : '—';
                  // Clean-flow adoption — only the button-based conversions
                  const buttonAdoption = realConversions > 0
                    ? `${row.converted} / ${realConversions}`
                    : '—';
                  return (
                    <tr key={row.month} className="hover:bg-white/5 transition-colors">
                      <td className="px-3 py-2 text-slate-300 font-mono">{row.month}</td>
                      <td className="px-3 py-2 text-right text-slate-300">{row.quotes_created}</td>
                      <td className="px-3 py-2 text-right text-slate-300">{row.orders}</td>
                      <td className="px-3 py-2 text-right text-emerald-400 font-semibold">{realConversions}</td>
                      <td className="px-3 py-2 text-right text-blue-400 font-bold">{convRate}{convRate !== '—' && '%'}</td>
                      <td className="px-3 py-2 text-right text-amber-400 text-[11px]">{buttonAdoption}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-3 px-3 space-y-1 text-[10px] text-slate-500">
              <p>
                <strong className="text-emerald-400">Quote → Order</strong> = customers who quoted and eventually ordered.
                This is your real business conversion rate.
              </p>
              <p>
                <strong className="text-amber-400">Used Button</strong> = how many of those used the "Convert to Order" button
                (preserves Meta attribution). The rest bypassed it. Target: climb to 100% over time.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── CAPI quality per day ──────────────────────────── */}
      <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-lg font-semibold text-white flex items-center gap-2">
              <Send className="w-4 h-4 text-brand-orange" />
              CAPI Events Sent to Meta (Last Period)
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Each Purchase event firing daily, broken down by attribution quality.
            </p>
          </div>
          <span className="text-xs font-medium text-slate-400 bg-slate-800 px-2 py-1 rounded-md">
            ${capiQuality.totalValue.toLocaleString()} total value reported
          </span>
        </div>
        {capiByDay.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">No CAPI events in this date range</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={capiByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="tracked"   stackId="a" fill="#10b981" name="🟢 Tracked (fbc)" />
              <Bar dataKey="partial"   stackId="a" fill="#f59e0b" name="🟡 Partial (utm)" />
              <Bar dataKey="untracked" stackId="a" fill="#ef4444" name="🔴 Untracked" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Bypass leaderboard ──────────────────────────── */}
      <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-lg font-semibold text-white flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              Agents Bypassing the Quote Flow
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Customer had a quote in the system, but the agent created a fresh order instead
              of using "Convert to Order" — this loses attribution and clutters data.
            </p>
          </div>
        </div>
        {bypassLeaderboard.length === 0 ? (
          <div className="py-8 text-center">
            <Shield className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm text-emerald-400 font-medium">Perfect — no agents bypassing the flow.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-slate-200">
              <thead className="text-xs font-bold text-slate-400 uppercase bg-slate-800/50 tracking-wider">
                <tr>
                  <th className="px-4 py-3 rounded-tl-lg">Agent</th>
                  <th className="px-4 py-3 text-center">Bypassed Orders</th>
                  <th className="px-4 py-3 text-right rounded-tr-lg">Coach Them On…</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {bypassLeaderboard.map((row, i) => (
                  <tr key={i} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-white">{row.agent}</td>
                    <td className="px-4 py-3 text-sm text-center">
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-xs font-bold border border-amber-500/30">
                        {row.count} {row.count === 1 ? 'order' : 'orders'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 text-right">
                      Use Quotes page → Convert to Order
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── CAPI quality summary table ────────────────── */}
      <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
        <h4 className="text-lg font-semibold text-white mb-4">
          What Meta Received This Period
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <QualityCard
            icon={<Shield className="w-5 h-5" />}
            label="🟢 Tracked"
            count={capiQuality.tracked}
            total={capiQuality.sent}
            description="Full ad attribution (fbc/fbp). Meta credits the original ad."
            color="emerald"
          />
          <QualityCard
            icon={<ShieldAlert className="w-5 h-5" />}
            label="🟡 Partial"
            count={capiQuality.partial}
            total={capiQuality.sent}
            description="UTM tags but no Meta click. Medium EMQ — campaign-only credit."
            color="amber"
          />
          <QualityCard
            icon={<ShieldOff className="w-5 h-5" />}
            label="🔴 Untracked"
            count={capiQuality.untracked}
            total={capiQuality.sent}
            description="No marketing signal at all. Low EMQ — Meta can't credit any ad."
            color="red"
          />
        </div>
      </div>

      {/* ── Lead Source conversion table ─────────────── */}
      <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h4 className="text-lg font-semibold text-white flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-brand-orange" />
              Lead Source Performance
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">Which channels bring the most revenue and highest average order value.</p>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <span className="text-slate-500 mr-1">Sort by:</span>
            {(['revenue', 'orders', 'avg'] as const).map(k => (
              <button
                key={k}
                onClick={() => setLsSortKey(k)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${lsSortKey === k ? 'bg-brand-orange text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
              >
                {k === 'revenue' ? 'Revenue' : k === 'orders' ? 'Orders' : 'Avg Order'}
              </button>
            ))}
          </div>
        </div>

        {/* Bar chart for top sources */}
        {sortedLeadSources.length > 0 && (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={sortedLeadSources.slice(0, 8)} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="source" stroke="#94a3b8" tick={{ fontSize: 10 }} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} tickFormatter={v => lsSortKey === 'orders' ? String(v) : `$${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                formatter={(val: any) => lsSortKey === 'orders' ? [val, 'Orders'] : [`$${Number(val).toLocaleString()}`, lsSortKey === 'revenue' ? 'Revenue' : 'Avg Order']}
              />
              <Bar dataKey={lsSortKey} fill="#fb6e1d" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-left text-sm">
            <thead className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-white/10">
              <tr>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2 text-right cursor-pointer hover:text-white" onClick={() => setLsSortKey('orders')}>Orders {lsSortKey === 'orders' && '↓'}</th>
                <th className="px-3 py-2 text-right cursor-pointer hover:text-white" onClick={() => setLsSortKey('revenue')}>Total Revenue {lsSortKey === 'revenue' && '↓'}</th>
                <th className="px-3 py-2 text-right cursor-pointer hover:text-white" onClick={() => setLsSortKey('avg')}>Avg Order {lsSortKey === 'avg' && '↓'}</th>
                <th className="px-3 py-2 text-right">Revenue Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(() => {
                const totalRev = sortedLeadSources.reduce((s, r) => s + r.revenue, 0);
                const maxRev = sortedLeadSources[0]?.revenue || 1;
                return sortedLeadSources.map((row, i) => (
                  <tr key={row.source} className="hover:bg-white/5 transition-colors">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 w-4">{i + 1}</span>
                        <span className="text-slate-200 font-medium">{row.source}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-300 font-mono">{row.orders}</td>
                    <td className="px-3 py-2.5 text-right text-white font-semibold">${row.revenue.toLocaleString()}</td>
                    <td className={`px-3 py-2.5 text-right font-semibold ${row.avg >= 300 ? 'text-emerald-400' : row.avg >= 200 ? 'text-amber-400' : 'text-slate-400'}`}>
                      ${row.avg.toFixed(0)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 bg-slate-700 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-full bg-brand-orange rounded-full"
                            style={{ width: `${(row.revenue / maxRev) * 100}%` }}
                          />
                        </div>
                        <span className="text-slate-400 text-xs w-10 text-right">
                          {totalRev > 0 ? ((row.revenue / totalRev) * 100).toFixed(1) : 0}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Per-order CAPI breakdown ──────────────────── */}
      <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
        <h4 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
          <Send className="w-4 h-4 text-brand-orange" />
          Order-level CAPI Breakdown
        </h4>
        <p className="text-xs text-slate-500 mb-4">
          Every order sent to Meta — click any row to open the order. EMQ is estimated based on signals available.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-white/10">
              <tr>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Value</th>
                <th className="px-3 py-2">Quality</th>
                <th className="px-3 py-2">Est. EMQ</th>
                <th className="px-3 py-2 text-center">Lead</th>
                <th className="px-3 py-2 text-center">Checkout</th>
                <th className="px-3 py-2 text-center">Purchase</th>
                <th className="px-3 py-2">Signals</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {orders
                .filter(o => o.capi_purchase_sent)
                .sort((a, b) => (b.capi_purchase_sent_at || '').localeCompare(a.capi_purchase_sent_at || ''))
                .map(o => {
                  const attr = o.attribution || {};
                  const hasFbc  = !!(attr.fbc  || attr.ctwa_clid || attr.ref);
                  const hasFbp  = !!(attr.fbp);
                  const hasIp   = !!(attr.client_ip);
                  const hasUa   = !!(attr.client_ua);
                  const hasEmail = !!(o.customer_email);
                  const hasUtm  = !!(attr.utm_source);

                  // EMQ estimate: each signal adds points
                  let emq = 0;
                  if (hasEmail) emq += 2.5;
                  if (hasFbc)   emq += 2.0;
                  if (hasFbp)   emq += 1.5;
                  if (hasIp)    emq += 1.0;
                  if (hasUa)    emq += 0.5;
                  if (hasUtm && !hasFbc) emq += 0.5;
                  emq = Math.min(emq, 10);

                  const q = o.attribution_quality ?? 'untracked';
                  const qConfig = {
                    tracked:   { label: '🟢 Tracked',   cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
                    partial:   { label: '🟡 Partial',   cls: 'bg-amber-500/15   text-amber-300   border-amber-500/30'   },
                    untracked: { label: '🔴 Untracked', cls: 'bg-red-500/15     text-red-300     border-red-500/30'     },
                  }[q];

                  const emqColor = emq >= 7 ? 'text-emerald-400' : emq >= 4 ? 'text-amber-400' : 'text-red-400';

                  const signals = [
                    hasEmail && 'Email',
                    hasFbc   && 'FBC',
                    hasFbp   && 'FBP',
                    hasIp    && 'IP',
                    hasUa    && 'UA',
                    hasUtm   && 'UTM',
                  ].filter(Boolean).join(', ') || 'None';

                  const leadEvents: CapiLeadEvent[] = Array.isArray(o.capi_lead_events) ? o.capi_lead_events : [];
                  const leadEvent     = leadEvents.find(e => e.event_name === 'Lead');
                  const checkoutEvent = leadEvents.find(e => e.event_name === 'InitiateCheckout');

                  const StageCell = ({ event }: { event: CapiLeadEvent | undefined }) => {
                    if (!event) return <td className="px-3 py-2.5 text-center text-slate-600 text-xs">—</td>;
                    return (
                      <td className="px-3 py-2.5 text-center">
                        <span title={`Fired ${new Date(event.fired_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${event.action_source}`}
                          className={`text-sm ${event.success ? 'text-emerald-400' : 'text-red-400'}`}>
                          {event.success ? '✓' : '✗'}
                        </span>
                      </td>
                    );
                  };

                  return (
                    <tr
                      key={o.id}
                      className="hover:bg-white/5 transition-colors cursor-pointer"
                      onClick={() => navigate(`/order/${o.order_number}`)}
                    >
                      <td className="px-3 py-2.5 font-mono text-brand-orange text-xs font-semibold">{o.order_number}</td>
                      <td className="px-3 py-2.5 text-slate-300 text-xs">{o.customer_name || o.customer_email || '—'}</td>
                      <td className="px-3 py-2.5 text-slate-300 text-xs">${Number(o.order_amount || 0).toLocaleString()}</td>
                      <td className="px-3 py-2.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${qConfig.cls}`}>
                          {qConfig.label}
                        </span>
                      </td>
                      <td className={`px-3 py-2.5 font-bold text-sm ${emqColor}`}>{emq.toFixed(1)}</td>
                      <StageCell event={leadEvent} />
                      <StageCell event={checkoutEvent} />
                      <td className="px-3 py-2.5 text-center">
                        <span className={`text-sm ${o.capi_purchase_sent ? 'text-emerald-400' : 'text-slate-600'}`} title={o.capi_purchase_sent_at ? `Fired ${new Date(o.capi_purchase_sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Not sent'}>
                          {o.capi_purchase_sent ? '✓' : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-400 text-xs">{signals}</td>
                    </tr>
                  );
                })}
              {orders.filter(o => o.capi_purchase_sent).length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-500 text-sm">No CAPI events in this period</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[10px] text-slate-600">
          EMQ estimated based on: Email (+2.5), FBC/CTWA/ref (+2.0), FBP (+1.5), IP (+1.0), UA (+0.5), UTM only (+0.5). Max 10.
          &nbsp;·&nbsp; <strong className="text-slate-500">Lead</strong> fires when mockup is sent (AWAITING_APPROVAL).
          &nbsp;·&nbsp; <strong className="text-slate-500">Checkout</strong> fires when customer approves (IN_PRODUCTION). Hover checkmarks for date &amp; source.
        </p>
      </div>

    </div>
  );
};

const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  color: 'emerald' | 'amber' | 'red' | 'blue';
}> = ({ icon, label, value, sub, color }) => {
  const colorMap = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    amber:   'text-amber-400   bg-amber-500/10   border-amber-500/30',
    red:     'text-red-400     bg-red-500/10     border-red-500/30',
    blue:    'text-blue-400    bg-blue-500/10    border-blue-500/30',
  };
  return (
    <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-xl">
      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg border mb-3 ${colorMap[color]}`}>
        {icon}
      </div>
      <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
    </div>
  );
};

const QualityCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  count: number;
  total: number;
  description: string;
  color: 'emerald' | 'amber' | 'red';
}> = ({ icon, label, count, total, description, color }) => {
  const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
  const colorMap = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    amber:   'text-amber-400   bg-amber-500/10   border-amber-500/30',
    red:     'text-red-400     bg-red-500/10     border-red-500/30',
  };
  return (
    <div className={`p-4 rounded-xl border ${colorMap[color]}`}>
      <div className="flex items-center gap-2 mb-2">{icon}<span className="font-semibold">{label}</span></div>
      <p className="text-3xl font-bold text-white mb-1">{count}</p>
      <p className="text-xs opacity-80 mb-2">{pct}% of {total} events</p>
      <p className="text-xs leading-relaxed opacity-70">{description}</p>
    </div>
  );
};

export default FunnelAttributionReport;
