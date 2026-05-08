// LeadSourceDistribution — "where do our leads come from?" donut + table
// Reads ALL quotes (paid + unpaid) and resolves source from attribution JSONB.
// Pairs with the existing "Performance by Source" (revenue) for full picture:
//   - Performance by Source = "which channel makes us money?"
//   - Lead Source Distribution = "which channel gives us volume?"

import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { detectLeadSource, LeadSource } from '../../utils/leadSource';
import { SOURCE_COLORS } from '../../constants/colors';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
} from 'recharts';
import Spinner from '../ui/Spinner';

interface Props {
  startDate?: Date | null;
  endDate?: Date | null;
}

interface QuoteRow {
  id: number;
  attribution: Record<string, any> | null;
  lead_source: string | null;
  estimated_amount: number | null;
  created_at: string;
}

const LeadSourceTooltip = ({ active, payload, totalLeads }: any) => {
  if (!active || !payload || payload.length === 0) return null;
  const firstItem = payload[0];
  if (!firstItem || !firstItem.payload) return null;
  const data = firstItem.payload;
  const percent = totalLeads > 0 ? ((data.leads / totalLeads) * 100).toFixed(1) : '0.0';

  return (
    <div className="bg-slate-900/95 backdrop-blur-xl border border-white/10 p-4 rounded-xl shadow-2xl min-w-[200px]">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/10">
        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: data.fill }} />
        <p className="font-bold text-white text-lg">{data.name}</p>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between items-center text-sm">
          <span className="text-slate-400">Leads:</span>
          <span className="text-white font-bold text-base">{data.leads}</span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-slate-400">Share:</span>
          <span className="text-brand-orange font-bold text-base">{percent}%</span>
        </div>
        {data.totalEstValue > 0 && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-400">Est. Value:</span>
            <span className="text-emerald-400 font-medium text-base">
              ${data.totalEstValue.toLocaleString()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

const LeadSourceDistribution: React.FC<Props> = ({ startDate, endDate }) => {
  const navigate = useNavigate();

  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ['quotes-for-lead-source', startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      let q = supabase
        .from('quotes')
        .select('id, attribution, lead_source, estimated_amount, created_at')
        .order('created_at', { ascending: false });

      if (startDate) q = q.gte('created_at', startDate.toISOString());
      if (endDate)   q = q.lte('created_at', endDate.toISOString());

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as QuoteRow[];
    },
    staleTime: 60_000,
  });

  const stats = useMemo(() => {
    const map = new Map<LeadSource, { leads: number; totalEstValue: number }>();

    quotes.forEach(quote => {
      const source = detectLeadSource({
        attribution: quote.attribution,
        lead_source: quote.lead_source,
      });
      const cur = map.get(source) ?? { leads: 0, totalEstValue: 0 };
      cur.leads += 1;
      cur.totalEstValue += Number(quote.estimated_amount ?? 0);
      map.set(source, cur);
    });

    return Array.from(map.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.leads - a.leads);
  }, [quotes]);

  const totalLeads = stats.reduce((sum, s) => sum + s.leads, 0);
  const pieData = stats.filter(s => s.leads > 0);

  if (isLoading) {
    return (
      <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl flex items-center justify-center min-h-[400px]">
        <Spinner />
      </div>
    );
  }

  if (totalLeads === 0) {
    return (
      <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl flex items-center justify-center min-h-[400px]">
        <p className="text-sm text-slate-400">No quotes in the selected date range</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Table */}
      <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-lg font-semibold text-white">Lead Source Distribution</h4>
            <p className="text-xs text-slate-500 mt-0.5">From all quote requests (form fills + chats)</p>
          </div>
          <span className="text-xs font-medium text-slate-400 bg-slate-800 px-2 py-1 rounded-md">
            {totalLeads} leads
          </span>
        </div>
        <div className="overflow-x-auto max-h-[400px] custom-scrollbar">
          <table className="w-full text-left text-slate-200">
            <thead className="text-xs font-bold text-slate-400 uppercase bg-slate-800/50 sticky top-0 tracking-wider">
              <tr>
                <th className="px-4 py-4 rounded-tl-lg">Source</th>
                <th className="px-4 py-4 text-center">Leads</th>
                <th className="px-4 py-4 text-right rounded-tr-lg">% Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {stats.map((s, i) => {
                const pct = totalLeads > 0 ? ((s.leads / totalLeads) * 100).toFixed(1) : '0.0';
                const color = SOURCE_COLORS[s.name] || SOURCE_COLORS['Other'];
                return (
                  <tr
                    key={i}
                    className="hover:bg-white/5 cursor-pointer transition-colors group"
                    onClick={() => navigate(`/quotes`)}
                  >
                    <td className="px-4 py-3.5 text-sm font-semibold text-white">
                      <div className="flex items-center gap-3">
                        <span
                          className="w-2.5 h-2.5 rounded-full shadow-sm flex-shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="group-hover:text-brand-orange transition-colors">
                          {s.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-center text-slate-300 font-medium">
                      {s.leads}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-right text-brand-orange font-bold tracking-wide">
                      {pct}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Donut */}
      <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-lg font-semibold text-white">Lead Volume by Source</h4>
          <span className="text-xs font-medium text-slate-400 bg-slate-800 px-2 py-1 rounded-md">
            {totalLeads} total
          </span>
        </div>
        <div className="flex-grow flex items-center justify-center">
          <ResponsiveContainer width="100%" height={400}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="leads"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={95}
                outerRadius={135}
                paddingAngle={4}
                cornerRadius={6}
                stroke="none"
              >
                {pieData.map((entry, i) => (
                  <Cell
                    key={`lead-cell-${i}`}
                    fill={SOURCE_COLORS[entry.name] || SOURCE_COLORS['Other']}
                    className="outline-none hover:opacity-80 transition-opacity duration-300 cursor-pointer"
                  />
                ))}
              </Pie>
              <Tooltip content={<LeadSourceTooltip totalLeads={totalLeads} />} />
              <Legend
                layout="vertical"
                verticalAlign="middle"
                align="right"
                iconType="circle"
                iconSize={10}
                wrapperStyle={{
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#e2e8f0',
                  lineHeight: '24px',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default LeadSourceDistribution;
