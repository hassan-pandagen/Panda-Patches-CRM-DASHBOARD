// src/components/reports/ProfitLossReportComponent.tsx

import React, { FC, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import StatCard from '../ui/StatCard';
import { DollarSign, TrendingUp, TrendingDown, Percent } from 'lucide-react';
import { getProfitLossReport } from '../../services/orderService';
import { DateRange } from '../ui/DateRangeFilter';
import Spinner from '../ui/Spinner';

interface ProfitLossReportProps {
  dateRange: DateRange;
}

const COLORS = ['#EF4444', '#F59E0B', '#84CC16', '#3B82F6', '#8B5CF6', '#EC4899'];

const ProfitLossReportComponent: FC<ProfitLossReportProps> = ({ dateRange }) => {
  const { data: report, isLoading, isError, error } = useQuery({
    queryKey: ['profitLossReport', dateRange.startDate, dateRange.endDate],
    queryFn: () => getProfitLossReport(dateRange.startDate, dateRange.endDate),
    staleTime: 60000,
  });

  const costsByCategory = useMemo(() => {
    if (!report?.costs_by_category) return [];
    return Object.entries(report.costs_by_category)
      .map(([name, value]) => ({ name, value: Number(value) }))
      .sort((a, b) => b.value - a.value);
  }, [report]);

  if (isLoading) {
    return <div className="flex justify-center items-center h-64"><Spinner /></div>;
  }

  if (isError) {
    return <div className="text-center py-10 text-red-400">Error loading report: {(error as Error).message}</div>;
  }

  if (!report) {
    return <div className="text-center py-10 text-slate-400">No data available for this date range.</div>;
  }

  const { total_revenue, total_costs, net_profit, profit_margin } = report;

  return (
    <div className="space-y-6">
      <h3 className="text-2xl font-semibold text-slate-100">Profit & Loss Overview</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Revenue"
          value={`$${Number(total_revenue).toLocaleString()}`}
          icon={<TrendingUp className="w-6 h-6" />}
          color="success"
        />
        <StatCard
          title="Total Costs"
          value={`$${Number(total_costs).toLocaleString()}`}
          icon={<TrendingDown className="w-6 h-6" />}
          color="error"
        />
        <StatCard
          title="Net Profit"
          value={`$${Number(net_profit).toLocaleString()}`}
          icon={<DollarSign className="w-6 h-6" />}
          color={Number(net_profit) >= 0 ? 'primary' : 'error'}
        />
        <StatCard
          title="Profit Margin"
          value={`${Number(profit_margin).toFixed(2)}%`}
          icon={<Percent className="w-6 h-6" />}
          color={Number(profit_margin) >= 0 ? 'info' : 'warning'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
          <h4 className="text-lg font-semibold text-white mb-4">Cost Breakdown by Category</h4>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={costsByCategory} layout="vertical" margin={{ left: 20, right: 20 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                stroke="#94A3B8"
                width={80}
                tick={{ fill: '#F8FAFC', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '0.75rem' }}
                formatter={(value: number) => [`$${value.toLocaleString()}`, 'Cost']}
              />
              <Bar dataKey="value" fill="#EF4444" radius={[0, 4, 4, 0]} background={{ fill: 'rgba(255,255,255,0.05)', radius: 4 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
          <h4 className="text-lg font-semibold text-white mb-4">Cost Distribution</h4>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={costsByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} fill="#8884d8" label>
                {costsByCategory.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '0.75rem' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default ProfitLossReportComponent;