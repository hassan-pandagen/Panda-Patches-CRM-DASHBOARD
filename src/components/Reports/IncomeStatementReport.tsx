import React, { useMemo } from 'react';
import { Order, OrderStatus, MonthlyCost } from '../../types';
import { DollarSign, TrendingDown, TrendingUp, Minus, Plus, FileText, AlertCircle } from 'lucide-react';
import { motion, Variants } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Cell } from 'recharts';

interface IncomeStatementReportProps {
  orders: Order[];
  monthlyCosts?: MonthlyCost[];
}

// --- ANIMATIONS ---
const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100, damping: 15 } }
};

// --- HELPER COMPONENTS ---
const StatRow: React.FC<{
  label: string;
  value: number;
  isSubtotal?: boolean;
  isTotal?: boolean;
  isNegative?: boolean;
  icon?: React.ReactNode;
  className?: string;
}> = ({ label, value, isSubtotal = false, isTotal = false, isNegative = false, icon, className = '' }) => {
  const textSize = isTotal ? 'text-xl' : isSubtotal ? 'text-lg' : 'text-base';
  const fontWeight = isTotal || isSubtotal ? 'font-bold' : 'font-medium';
  const textColor = isTotal
    ? value >= 0 ? 'text-emerald-400' : 'text-red-400'
    : isNegative
    ? 'text-red-300'
    : 'text-slate-300';

  return (
    <div className={`flex items-center justify-between py-3 ${isTotal ? 'border-t-2 border-brand-orange/50 pt-4 mt-2' : isSubtotal ? 'border-t border-slate-700 mt-2' : ''} ${className}`}>
      <div className="flex items-center gap-3">
        {icon && <div className="text-slate-400">{icon}</div>}
        <span className={`${textSize} ${fontWeight} ${textColor}`}>
          {isNegative && '(-) '}
          {label}
        </span>
      </div>
      <span className={`${textSize} ${fontWeight} ${textColor} font-mono`}>
        ${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    </div>
  );
};

// --- RICH TOOLTIP ---
const FinancialTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900/95 backdrop-blur-xl border border-white/10 p-4 rounded-xl shadow-2xl min-w-[200px] z-50">
        {label && <p className="text-slate-300 font-semibold mb-2 border-b border-white/10 pb-1">{label}</p>}
        {payload.map((entry: any, index: number) => (
          <div key={index} className="mb-1">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span style={{ color: entry.color }} className="font-medium">{entry.name}:</span>
              <span className="text-white font-bold">${typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}</span>
            </div>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const IncomeStatementReport: React.FC<IncomeStatementReportProps> = ({ orders, monthlyCosts = [] }) => {
  // Calculate Income Statement Metrics
  const incomeStatement = useMemo(() => {
    // 1. GROSS REVENUE (All orders including cancelled/refunded)
    const grossRevenue = orders.reduce((sum, order) => sum + (order.orderAmount || 0), 0);

    // 2. DEDUCTIONS
    const cancelledRevenue = orders
      .filter(o => o.status === OrderStatus.CANCELLED)
      .reduce((sum, order) => sum + (order.orderAmount || 0), 0);

    const refundedRevenue = orders
      .filter(o => o.status === OrderStatus.REFUNDED)
      .reduce((sum, order) => sum + (order.orderAmount || 0), 0);

    const totalDeductions = cancelledRevenue + refundedRevenue;

    // 3. NET REVENUE
    const netRevenue = grossRevenue - totalDeductions;

    // 4. COST OF GOODS SOLD (COGS)
    const validOrders = orders.filter(o =>
      o.status !== OrderStatus.CANCELLED &&
      o.status !== OrderStatus.REFUNDED
    );

    const productionCosts = validOrders.reduce((sum, order) => sum + (order.productionCost || 0), 0);
    const shippingCosts = validOrders.reduce((sum, order) => sum + (order.shippingCost || 0), 0);
    const totalCOGS = productionCosts + shippingCosts;

    // 5. GROSS PROFIT
    const grossProfit = netRevenue - totalCOGS;

    // 6. OPERATING EXPENSES
    const marketingCosts = validOrders.reduce((sum, order) => sum + (order.marketingCost || 0), 0);

    // Monthly operating expenses
    const monthlyOperatingExpenses = monthlyCosts.reduce((sum, cost) => sum + cost.amount, 0);

    // Aggregate monthly costs by category
    const monthlyCostsByCategory = monthlyCosts.reduce((acc, cost) => {
      acc[cost.category] = (acc[cost.category] || 0) + cost.amount;
      return acc;
    }, {} as Record<string, number>);

    const totalOperatingExpenses = marketingCosts + monthlyOperatingExpenses;

    // 7. NET PROFIT
    const netProfit = grossProfit - totalOperatingExpenses;

    // 8. MARGINS
    const grossProfitMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;
    const netProfitMargin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

    // 9. COUNTS
    const totalOrdersCount = orders.length;
    const cancelledCount = orders.filter(o => o.status === OrderStatus.CANCELLED).length;
    const refundedCount = orders.filter(o => o.status === OrderStatus.REFUNDED).length;
    const validOrdersCount = validOrders.length;

    return {
      grossRevenue,
      cancelledRevenue,
      refundedRevenue,
      totalDeductions,
      netRevenue,
      productionCosts,
      shippingCosts,
      totalCOGS,
      grossProfit,
      marketingCosts,
      monthlyOperatingExpenses,
      monthlyCostsByCategory,
      totalOperatingExpenses,
      netProfit,
      grossProfitMargin,
      netProfitMargin,
      totalOrdersCount,
      cancelledCount,
      refundedCount,
      validOrdersCount,
    };
  }, [orders, monthlyCosts]);

  // Daily Trend Data
  const dailyTrend = useMemo(() => {
    const dailyData = orders.reduce((acc, order) => {
      if (order.createdAt && order.status !== OrderStatus.CANCELLED && order.status !== OrderStatus.REFUNDED) {
        const date = new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (!acc[date]) acc[date] = { revenue: 0, costs: 0, profit: 0 };

        acc[date].revenue += (order.orderAmount || 0);
        const orderCosts = (order.productionCost || 0) + (order.shippingCost || 0) + (order.marketingCost || 0);
        acc[date].costs += orderCosts;
        acc[date].profit += (order.orderAmount || 0) - orderCosts;
      }
      return acc;
    }, {} as Record<string, { revenue: number, costs: number, profit: number }>);

    return Object.entries(dailyData)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [orders]);

  // Breakdown Data for Bar Chart
  const breakdownData = [
    { name: 'Production', value: incomeStatement.productionCosts, color: '#3B82F6' },
    { name: 'Shipping', value: incomeStatement.shippingCosts, color: '#F59E0B' },
    { name: 'Marketing', value: incomeStatement.marketingCosts, color: '#EF4444' },
  ].filter(item => item.value > 0);

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={cardVariants}
        className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-brand-orange/10 rounded-lg">
            <FileText className="w-6 h-6 text-brand-orange" />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-white">Income Statement</h3>
            <p className="text-sm text-slate-400">Professional financial summary - Industry standard format</p>
          </div>
        </div>

        {/* Key Metrics Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-slate-800/50 rounded-xl p-4 border border-emerald-500/30">
            <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Net Revenue</p>
            <p className="text-2xl font-bold text-emerald-400">${incomeStatement.netRevenue.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-1">{incomeStatement.validOrdersCount} valid orders</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-4 border border-blue-500/30">
            <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Gross Profit</p>
            <p className="text-2xl font-bold text-blue-400">${incomeStatement.grossProfit.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-1">{incomeStatement.grossProfitMargin.toFixed(1)}% margin</p>
          </div>
          <div className={`bg-slate-800/50 rounded-xl p-4 border ${incomeStatement.netProfit >= 0 ? 'border-brand-orange/30' : 'border-red-500/30'}`}>
            <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Net Profit</p>
            <p className={`text-2xl font-bold ${incomeStatement.netProfit >= 0 ? 'text-brand-orange' : 'text-red-400'}`}>
              ${incomeStatement.netProfit.toLocaleString()}
            </p>
            <p className="text-xs text-slate-500 mt-1">{incomeStatement.netProfitMargin.toFixed(1)}% margin</p>
          </div>
        </div>
      </motion.div>

      {/* MAIN INCOME STATEMENT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Detailed Statement */}
        <div className="lg:col-span-2 bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
          <h4 className="text-lg font-semibold text-white mb-6">Detailed Income Statement</h4>

          <div className="space-y-1">
            {/* REVENUE SECTION */}
            <StatRow
              label="Gross Revenue"
              value={incomeStatement.grossRevenue}
              icon={<Plus className="w-4 h-4" />}
            />

            {incomeStatement.cancelledRevenue > 0 && (
              <StatRow
                label={`Less: Cancellations (${incomeStatement.cancelledCount} orders)`}
                value={incomeStatement.cancelledRevenue}
                isNegative={true}
                icon={<Minus className="w-4 h-4" />}
              />
            )}

            {incomeStatement.refundedRevenue > 0 && (
              <StatRow
                label={`Less: Refunds (${incomeStatement.refundedCount} orders)`}
                value={incomeStatement.refundedRevenue}
                isNegative={true}
                icon={<Minus className="w-4 h-4" />}
              />
            )}

            <StatRow
              label="Net Revenue"
              value={incomeStatement.netRevenue}
              isSubtotal={true}
              icon={<TrendingUp className="w-5 h-5" />}
            />

            {/* COGS SECTION */}
            <div className="mt-6">
              <p className="text-sm font-semibold text-slate-400 uppercase mb-2">Cost of Goods Sold (COGS)</p>
              <StatRow
                label="Production Costs"
                value={incomeStatement.productionCosts}
                isNegative={true}
              />
              <StatRow
                label="Shipping Costs"
                value={incomeStatement.shippingCosts}
                isNegative={true}
              />
              <StatRow
                label="Total COGS"
                value={incomeStatement.totalCOGS}
                isSubtotal={true}
                isNegative={true}
                icon={<TrendingDown className="w-5 h-5" />}
              />
            </div>

            {/* GROSS PROFIT */}
            <StatRow
              label="Gross Profit"
              value={incomeStatement.grossProfit}
              isSubtotal={true}
              icon={<DollarSign className="w-5 h-5" />}
              className="bg-blue-500/10 px-3 rounded-lg"
            />

            {/* OPERATING EXPENSES */}
            <div className="mt-6">
              <p className="text-sm font-semibold text-slate-400 uppercase mb-2">Operating Expenses</p>
              <StatRow
                label="Marketing & Advertising (Order-Level)"
                value={incomeStatement.marketingCosts}
                isNegative={true}
              />

              {/* Monthly operating expenses by category */}
              {Object.entries(incomeStatement.monthlyCostsByCategory).map(([category, amount]) => (
                <StatRow
                  key={category}
                  label={category}
                  value={amount}
                  isNegative={true}
                />
              ))}

              {incomeStatement.monthlyOperatingExpenses > 0 && (
                <StatRow
                  label="Total Monthly Expenses"
                  value={incomeStatement.monthlyOperatingExpenses}
                  isSubtotal={false}
                  isNegative={true}
                  className="bg-purple-500/5 px-3 rounded-lg mt-2"
                />
              )}

              <StatRow
                label="Total Operating Expenses"
                value={incomeStatement.totalOperatingExpenses}
                isSubtotal={true}
                isNegative={true}
                icon={<TrendingDown className="w-5 h-5" />}
              />
            </div>

            {/* NET PROFIT */}
            <StatRow
              label="Net Profit (Bottom Line)"
              value={incomeStatement.netProfit}
              isTotal={true}
              icon={incomeStatement.netProfit >= 0 ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
              className="bg-gradient-to-r from-brand-orange/10 to-transparent px-3 rounded-lg"
            />
          </div>

          {/* Warning if loss */}
          {incomeStatement.netProfit < 0 && (
            <div className="mt-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-400">Operating at a Loss</p>
                <p className="text-xs text-red-300 mt-1">
                  Your expenses exceed revenue. Review cost structure and pricing strategy.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right: Cost Breakdown Chart */}
        <div className="lg:col-span-1 bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
          <h4 className="text-lg font-semibold text-white mb-6">Cost Breakdown</h4>

          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={breakdownData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} horizontal={false} />
              <XAxis type="number" stroke="#94A3B8" hide />
              <YAxis type="category" dataKey="name" stroke="#cbd5e1" width={80} style={{ fontSize: '12px', fontWeight: 500 }} />
              <Tooltip content={<FinancialTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Bar dataKey="value" name="Cost" radius={[0, 4, 4, 0]} barSize={24}>
                {breakdownData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Summary Stats */}
          <div className="mt-6 space-y-3">
            <div className="bg-slate-800/50 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1">Total Orders</p>
              <p className="text-xl font-bold text-white">{incomeStatement.totalOrdersCount}</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1">Valid Orders</p>
              <p className="text-xl font-bold text-emerald-400">{incomeStatement.validOrdersCount}</p>
            </div>
            {(incomeStatement.cancelledCount + incomeStatement.refundedCount) > 0 && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <p className="text-xs text-red-400 mb-1">Lost Orders</p>
                <p className="text-xl font-bold text-red-400">
                  {incomeStatement.cancelledCount + incomeStatement.refundedCount}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {incomeStatement.cancelledCount} cancelled, {incomeStatement.refundedCount} refunded
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PROFIT TREND CHART */}
      {dailyTrend.length > 0 && (
        <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
          <h4 className="text-lg font-semibold text-white mb-6">Daily Financial Performance</h4>
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={dailyTrend}>
              <defs>
                <linearGradient id="colorRevenue2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorProfit2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
              <XAxis dataKey="date" stroke="#94A3B8" style={{ fontSize: '12px' }} />
              <YAxis stroke="#94A3B8" style={{ fontSize: '12px' }} tickFormatter={(v) => `$${v}`} />
              <Tooltip content={<FinancialTooltip />} />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#3B82F6" fill="url(#colorRevenue2)" strokeWidth={3} />
              <Area type="monotone" dataKey="profit" name="Profit" stroke="#10B981" fill="url(#colorProfit2)" strokeWidth={3} />
              <Area type="monotone" dataKey="costs" name="Costs" stroke="#EF4444" fill="transparent" strokeWidth={2} strokeDasharray="5 5" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default IncomeStatementReport;
