// src/components/Reports/LeadSourceAttributionReport.tsx
// CLADB5 Task 2 — Lead Source Attribution. "Traffic" is resolved from each quote's
// attribution.traffic_source (fallback detectLeadSource); "heard_about" from
// attribution.heard_about (fallback: historical "Source: X" in instructions). Order matching
// is by NORMALIZED email (quotes → orders → Square-confirmed amount_paid).
import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAttributionData } from '../../services/attributionReportService';
import {
  resolveTrafficGroup, resolveHeardAbout, TRAFFIC_GROUPS, TrafficGroup,
  HEARD_ABOUT_OPTIONS, HeardAbout,
} from '../../utils/leadSource';
import { Share2, Download, Sparkles } from 'lucide-react';

interface DateRange { startDate: string; endDate: string; }

interface DimRow<K extends string> {
  key: K;
  quotes: number;
  uniqueLeads: number;
  quotesToOrders: number;
  orders: number;
  paidOrders: number;
  revenue: number;
}

const money = (n: number) => '$' + Math.round(n).toLocaleString();

const downloadCsv = (filename: string, header: string[], rows: (string | number)[][]) => {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

const Card: React.FC<{ title: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }> = ({ title, icon, action, children }) => (
  <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-bold text-white flex items-center gap-2">{icon}{title}</h3>
      {action}
    </div>
    {children}
  </div>
);

const DimTable = <K extends string>({ label, rows, csvName }: { label: string; rows: DimRow<K>[]; csvName: string }) => {
  const totals = rows.reduce((t, r) => ({ q: t.q + r.quotes, l: t.l + r.uniqueLeads, o2: t.o2 + r.quotesToOrders, o: t.o + r.orders, p: t.p + r.paidOrders, rev: t.rev + r.revenue }), { q: 0, l: 0, o2: 0, o: 0, p: 0, rev: 0 });
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-white/5 text-xs text-slate-400 uppercase tracking-wider">
            <th className="py-2 pr-4">{label}</th>
            <th className="py-2 px-3 text-right">Quotes</th>
            <th className="py-2 px-3 text-right">Unique Leads</th>
            <th className="py-2 px-3 text-right">Quotes→Orders</th>
            <th className="py-2 px-3 text-right">Orders</th>
            <th className="py-2 px-3 text-right">Paid</th>
            <th className="py-2 px-3 text-right">Revenue</th>
            <th className="py-2 pl-3 text-right">Rev/Quote</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 text-slate-200">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="py-2.5 pr-4 font-semibold text-white">{r.key}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{r.quotes.toLocaleString()}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{r.uniqueLeads.toLocaleString()}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{r.quotesToOrders.toLocaleString()}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{r.orders.toLocaleString()}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{r.paidOrders.toLocaleString()}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{money(r.revenue)}</td>
              <td className="py-2.5 pl-3 text-right tabular-nums">{r.quotes ? money(r.revenue / r.quotes) : '—'}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={8} className="py-4 text-center text-slate-400">No data in this range.</td></tr>}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="border-t border-white/10 text-white font-semibold">
              <td className="py-2.5 pr-4">Total</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{totals.q.toLocaleString()}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{totals.l.toLocaleString()}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{totals.o2.toLocaleString()}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{totals.o.toLocaleString()}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{totals.p.toLocaleString()}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{money(totals.rev)}</td>
              <td className="py-2.5 pl-3 text-right tabular-nums">{totals.q ? money(totals.rev / totals.q) : '—'}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
};

const LeadSourceAttributionReport: React.FC<{ dateRange: DateRange }> = ({ dateRange }) => {
  const startISO = `${dateRange.startDate}T00:00:00`;
  const endISO = `${dateRange.endDate}T23:59:59`;

  const { data, isLoading } = useQuery({
    queryKey: ['attribution-report', dateRange.startDate, dateRange.endDate],
    queryFn: () => fetchAttributionData(startISO, endISO),
  });

  const agg = useMemo(() => {
    const quotes = data?.quotes ?? [];
    const orders = data?.orders ?? [];

    const quoteDims = quotes.map((q) => ({
      email: q.email,
      createdAt: q.createdAt,
      traffic: resolveTrafficGroup({ attribution: q.attribution, lead_source: q.leadSource }),
      heard: resolveHeardAbout(q.attribution, q.instructions) as HeardAbout | null,
    }));

    // email → latest quote's dims (attribute an email's orders to its most recent touch)
    const latest = new Map<string, { at: string; traffic: TrafficGroup; heard: HeardAbout | null }>();
    for (const d of quoteDims) {
      if (!d.email) continue;
      const prev = latest.get(d.email);
      if (!prev || d.createdAt > prev.at) latest.set(d.email, { at: d.createdAt, traffic: d.traffic, heard: d.heard });
    }

    // per-email order totals
    const orderByEmail = new Map<string, { orders: number; paid: number; revenue: number }>();
    for (const o of orders) {
      const a = orderByEmail.get(o.email) ?? { orders: 0, paid: 0, revenue: 0 };
      a.orders += 1; if (o.amountPaid > 0) { a.paid += 1; a.revenue += o.amountPaid; }
      orderByEmail.set(o.email, a);
    }

    function buildRows<K extends string>(dimOfEmail: (e: string) => K | null, keyOfQuote: (d: typeof quoteDims[number]) => K | null, universe: readonly K[]): DimRow<K>[] {
      const q = new Map<K, { quotes: number; leads: Set<string> }>();
      for (const d of quoteDims) {
        const k = keyOfQuote(d); if (k == null) continue;
        const g = q.get(k) ?? { quotes: 0, leads: new Set<string>() };
        g.quotes += 1; if (d.email) g.leads.add(d.email); q.set(k, g);
      }
      const o = new Map<K, { orders: number; paid: number; revenue: number; emails: Set<string> }>();
      for (const [email, tot] of orderByEmail) {
        const k = dimOfEmail(email); if (k == null) continue;
        const g = o.get(k) ?? { orders: 0, paid: 0, revenue: 0, emails: new Set<string>() };
        g.orders += tot.orders; g.paid += tot.paid; g.revenue += tot.revenue; g.emails.add(email); o.set(k, g);
      }
      return universe.map((k) => {
        const qq = q.get(k); const oo = o.get(k);
        const leads = qq?.leads ?? new Set<string>();
        const converted = oo ? [...leads].filter((e) => oo.emails.has(e)).length : 0;
        return { key: k, quotes: qq?.quotes ?? 0, uniqueLeads: leads.size, quotesToOrders: converted, orders: oo?.orders ?? 0, paidOrders: oo?.paid ?? 0, revenue: oo?.revenue ?? 0 };
      }).filter((r) => r.quotes > 0 || r.orders > 0);
    }

    const trafficRows = buildRows<TrafficGroup>((e) => latest.get(e)?.traffic ?? null, (d) => d.traffic, TRAFFIC_GROUPS);
    const heardRows = buildRows<HeardAbout>((e) => latest.get(e)?.heard ?? null, (d) => d.heard, HEARD_ABOUT_OPTIONS);

    // traffic × heard_about matrix (quote counts) — only over quotes that reported heard_about
    const cell = new Map<string, number>();
    const heardPresent = new Set<HeardAbout>();
    let heardTotal = 0;
    for (const d of quoteDims) {
      if (!d.heard) continue;
      heardPresent.add(d.heard); heardTotal += 1;
      const key = `${d.traffic}|${d.heard}`;
      cell.set(key, (cell.get(key) ?? 0) + 1);
    }
    const heardCols = HEARD_ABOUT_OPTIONS.filter((h) => heardPresent.has(h));
    const matrixTrafficRows = TRAFFIC_GROUPS.filter((t) => heardCols.some((h) => (cell.get(`${t}|${h}`) ?? 0) > 0));

    // weekly trend (quotes per traffic group per ISO-week)
    const weekKey = (iso: string) => {
      const dt = new Date(iso); const day = (dt.getUTCDay() + 6) % 7;
      dt.setUTCDate(dt.getUTCDate() - day); return dt.toISOString().slice(0, 10);
    };
    const weeklyMap = new Map<string, Map<TrafficGroup, number>>();
    for (const d of quoteDims) {
      const wk = weekKey(d.createdAt);
      const m = weeklyMap.get(wk) ?? new Map<TrafficGroup, number>();
      m.set(d.traffic, (m.get(d.traffic) ?? 0) + 1); weeklyMap.set(wk, m);
    }
    const weeks = [...weeklyMap.keys()].sort();
    const weekly = weeks.map((wk) => ({ week: wk, counts: weeklyMap.get(wk)! }));

    return { trafficRows, heardRows, cell, heardCols, matrixTrafficRows, heardTotal, weekly, weeks };
  }, [data]);

  if (isLoading) return <div className="text-sm text-slate-400">Loading attribution…</div>;

  const { trafficRows, heardRows, cell, heardCols, matrixTrafficRows, heardTotal, weekly, weeks } = agg;

  return (
    <div className="space-y-6">
      <Card
        title="By Traffic Source"
        icon={<Share2 size={18} className="text-brand-orange" />}
        action={
          <button
            onClick={() => downloadCsv(`traffic-${dateRange.startDate}_${dateRange.endDate}.csv`,
              ['Traffic', 'Quotes', 'Unique Leads', 'Quotes→Orders', 'Orders', 'Paid Orders', 'Revenue', 'Rev/Quote'],
              trafficRows.map((r) => [r.key, r.quotes, r.uniqueLeads, r.quotesToOrders, r.orders, r.paidOrders, Math.round(r.revenue), r.quotes ? (r.revenue / r.quotes).toFixed(2) : '0']))}
            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md border bg-slate-700/40 border-slate-600 text-slate-200 hover:bg-slate-700/60">
            <Download size={12} /> CSV
          </button>
        }
      >
        <DimTable label="Traffic" rows={trafficRows} csvName="traffic" />
        <p className="text-[11px] text-slate-500 mt-3">Traffic from attribution.traffic_source; orders matched to quotes by normalized email; revenue = Square-confirmed amount_paid.</p>
      </Card>

      <Card
        title="By Heard-About (self-reported)"
        icon={<Sparkles size={18} className="text-brand-orange" />}
        action={
          <button
            onClick={() => downloadCsv(`heard-about-${dateRange.startDate}_${dateRange.endDate}.csv`,
              ['Heard About', 'Quotes', 'Unique Leads', 'Quotes→Orders', 'Orders', 'Paid Orders', 'Revenue', 'Rev/Quote'],
              heardRows.map((r) => [r.key, r.quotes, r.uniqueLeads, r.quotesToOrders, r.orders, r.paidOrders, Math.round(r.revenue), r.quotes ? (r.revenue / r.quotes).toFixed(2) : '0']))}
            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md border bg-slate-700/40 border-slate-600 text-slate-200 hover:bg-slate-700/60">
            <Download size={12} /> CSV
          </button>
        }
      >
        {heardRows.length === 0 ? (
          <p className="text-sm text-slate-400">No quotes reported "how did you hear about us" in this range (optional field; historical quotes carry it in instructions).</p>
        ) : (
          <DimTable label="Heard About" rows={heardRows} csvName="heard" />
        )}
      </Card>

      {/* Traffic × Heard-About matrix — the "AI demand captured via other channels" view */}
      <Card
        title="Traffic × Heard-About (quotes)"
        icon={<Sparkles size={18} className="text-amber-400" />}
        action={heardTotal > 0 ? (
          <button
            onClick={() => downloadCsv(`matrix-${dateRange.startDate}_${dateRange.endDate}.csv`,
              ['Traffic', ...heardCols],
              matrixTrafficRows.map((t) => [t, ...heardCols.map((h) => cell.get(`${t}|${h}`) ?? 0)]))}
            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md border bg-slate-700/40 border-slate-600 text-slate-200 hover:bg-slate-700/60">
            <Download size={12} /> CSV
          </button>
        ) : undefined}
      >
        {heardTotal === 0 ? (
          <p className="text-sm text-slate-400">No heard-about data in this range yet. New quotes populate this once customers answer the optional question.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/5 text-xs text-slate-400 uppercase tracking-wider">
                  <th className="py-2 pr-4">Traffic ↓ / Heard →</th>
                  {heardCols.map((h) => (
                    <th key={h} className={`py-2 px-3 text-right ${h === 'ChatGPT / Claude' ? 'text-emerald-300' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-200">
                {matrixTrafficRows.map((t) => (
                  <tr key={t}>
                    <td className="py-2 pr-4 font-semibold text-white">{t}</td>
                    {heardCols.map((h) => {
                      const v = cell.get(`${t}|${h}`) ?? 0;
                      const ai = h === 'ChatGPT / Claude';
                      return (
                        <td key={h} className={`py-2 px-3 text-right tabular-nums ${ai && v > 0 ? 'text-emerald-300 font-semibold' : v === 0 ? 'text-slate-600' : ''}`}>{v}</td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-slate-500 mt-3">
              The <span className="text-emerald-300">ChatGPT / Claude</span> column against Google Ads / Google Organic is the AI-created-demand-captured-elsewhere signal.
              Cells count quotes that reported that answer (blank answers excluded).
            </p>
          </div>
        )}
      </Card>

      <Card title="Weekly Quotes by Source">
        {weeks.length === 0 ? (
          <p className="text-sm text-slate-400">No data.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/5 text-xs text-slate-400 uppercase tracking-wider">
                  <th className="py-2 pr-4">Week of</th>
                  {trafficRows.map((r) => <th key={r.key} className="py-2 px-3 text-right">{r.key}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-200">
                {weekly.map((w) => (
                  <tr key={w.week}>
                    <td className="py-2 pr-4 text-white">{w.week}</td>
                    {trafficRows.map((r) => <td key={r.key} className="py-2 px-3 text-right tabular-nums">{w.counts.get(r.key) ?? 0}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default LeadSourceAttributionReport;
