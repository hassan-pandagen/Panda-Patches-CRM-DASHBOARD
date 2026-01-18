import React, { useMemo, useState } from 'react';
import { Order } from '../../types';
import SpotlightCard from '../ui/SpotlightCard';
import { useNavigate } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { DollarSign, TrendingUp, Package, Award, AlertCircle, ChevronDown } from 'lucide-react';
import { PATCH_TYPE_COLORS } from '../../constants/colors';

interface ProductMixAnalysisProps {
  orders: Order[];
}

const ProductMixAnalysis: React.FC<ProductMixAnalysisProps> = ({ orders }) => {
  const navigate = useNavigate();
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // Calculate category performance
  const categoryStats = useMemo(() => {
    const stats: Record<string, {
      orders: number;
      revenue: number;
      productionCost: number;
      shippingCost: number;
      marketingCost: number;
      totalCost: number;
      profit: number;
      margin: number;
      ordersList: Order[];
    }> = {};

    orders.forEach(order => {
      const category = order.patchesType || 'Unknown';
      if (!stats[category]) {
        stats[category] = {
          orders: 0,
          revenue: 0,
          productionCost: 0,
          shippingCost: 0,
          marketingCost: 0,
          totalCost: 0,
          profit: 0,
          margin: 0,
          ordersList: [],
        };
      }

      // For refunded orders, use originalAmount to show true revenue impact
      const revenue = order.status === 'REFUNDED'
        ? ((order as any).originalAmount || order.orderAmount || 0)
        : (order.orderAmount || 0);
      const prodCost = order.productionCost || 0;
      const shipCost = order.shippingCost || 0;
      const mktCost = order.marketingCost || 0;
      const totalCost = prodCost + shipCost + mktCost;
      const profit = revenue - totalCost;

      stats[category].orders += 1;
      stats[category].revenue += revenue;
      stats[category].productionCost += prodCost;
      stats[category].shippingCost += shipCost;
      stats[category].marketingCost += mktCost;
      stats[category].totalCost += totalCost;
      stats[category].profit += profit;
      stats[category].ordersList.push(order);
    });

    // Calculate margins
    Object.keys(stats).forEach(category => {
      const data = stats[category];
      data.margin = data.revenue > 0 ? (data.profit / data.revenue) * 100 : 0;
    });

    return Object.entries(stats)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.profit - a.profit);
  }, [orders]);

  // Quantity band analysis
  const quantityBandStats = useMemo(() => {
    const bands = [
      { label: '1-50 pcs', min: 1, max: 50 },
      { label: '51-100 pcs', min: 51, max: 100 },
      { label: '101-200 pcs', min: 101, max: 200 },
      { label: '200+ pcs', min: 201, max: Infinity },
    ];

    return bands.map(band => {
      const bandOrders = orders.filter(o => {
        const qty = o.patchesQuantity || 0;
        return qty >= band.min && qty <= band.max;
      });

      let totalRevenue = 0;
      let totalCost = 0;

      bandOrders.forEach(order => {
        const revenue = order.status === 'REFUNDED'
          ? ((order as any).originalAmount || order.orderAmount || 0)
          : (order.orderAmount || 0);
        totalRevenue += revenue;
        totalCost += (order.productionCost || 0) + (order.shippingCost || 0) + (order.marketingCost || 0);
      });

      const profit = totalRevenue - totalCost;
      const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
      const avgProfit = bandOrders.length > 0 ? profit / bandOrders.length : 0;

      return {
        label: band.label,
        orders: bandOrders.length,
        revenue: totalRevenue,
        totalCost,
        profit,
        margin,
        avgProfit,
      };
    });
  }, [orders]);

  // Top 10 best orders (highest profit)
  const topOrders = useMemo(() => {
    return orders
      .map(order => {
        const revenue = order.status === 'REFUNDED'
          ? ((order as any).originalAmount || order.orderAmount || 0)
          : (order.orderAmount || 0);
        const totalCost = (order.productionCost || 0) + (order.shippingCost || 0) + (order.marketingCost || 0);
        const profit = revenue - totalCost;
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
        return { ...order, profit, margin, totalCost };
      })
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 10);
  }, [orders]);

  // Bottom 10 worst orders (lowest profit or loss)
  const worstOrders = useMemo(() => {
    return orders
      .map(order => {
        const revenue = order.status === 'REFUNDED'
          ? ((order as any).originalAmount || order.orderAmount || 0)
          : (order.orderAmount || 0);
        const totalCost = (order.productionCost || 0) + (order.shippingCost || 0) + (order.marketingCost || 0);
        const profit = revenue - totalCost;
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
        return { ...order, profit, margin, totalCost };
      })
      .filter(o => o.totalCost > 0) // Only show orders with costs entered
      .sort((a, b) => a.profit - b.profit)
      .slice(0, 10);
  }, [orders]);

  // Overall stats
  const overallStats = useMemo(() => {
    let totalRevenue = 0;
    let totalCost = 0;
    let ordersWithCosts = 0;

    orders.forEach(order => {
      const revenue = order.status === 'REFUNDED'
        ? ((order as any).originalAmount || order.orderAmount || 0)
        : (order.orderAmount || 0);
      const cost = (order.productionCost || 0) + (order.shippingCost || 0) + (order.marketingCost || 0);
      totalRevenue += revenue;
      totalCost += cost;
      if (cost > 0) ordersWithCosts++;
    });

    const profit = totalRevenue - totalCost;
    const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

    return {
      totalRevenue,
      totalCost,
      profit,
      margin,
      totalOrders: orders.length,
      ordersWithCosts,
    };
  }, [orders]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length > 0) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900/95 backdrop-blur-xl border border-white/10 p-4 rounded-xl shadow-2xl min-w-[200px]">
          <p className="font-bold text-white text-sm mb-2">{data.name}</p>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between gap-4">
              <span className="text-slate-400">Revenue:</span>
              <span className="text-green-400 font-bold">${data.revenue?.toLocaleString()}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-400">Cost:</span>
              <span className="text-red-400 font-bold">${data.totalCost?.toLocaleString()}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-400">Profit:</span>
              <span className={`font-bold ${data.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                ${data.profit?.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-400">Margin:</span>
              <span className="text-brand-orange font-bold">{data.margin?.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // Show warning if no costs entered
  if (overallStats.ordersWithCosts === 0) {
    return (
      <div className="space-y-6">
        <SpotlightCard className="p-8">
          <div className="flex flex-col items-center justify-center text-center space-y-4">
            <div className="p-4 bg-amber-500/10 rounded-full">
              <AlertCircle className="w-12 h-12 text-amber-400" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white mb-2">No Cost Data Available</h3>
              <p className="text-slate-400 max-w-md">
                Please enter production, shipping, and marketing costs for your orders to see profitability analysis.
              </p>
            </div>
            <button
              onClick={() => navigate('/bulk-cost-entry')}
              className="mt-4 px-6 py-3 bg-brand-orange hover:bg-brand-orange/90 text-white rounded-lg font-semibold transition-colors"
            >
              Go to Bulk Cost Entry
            </button>
          </div>
        </SpotlightCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <SpotlightCard className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm font-medium">Total Revenue</p>
              <p className="text-3xl font-bold text-white mt-1">${overallStats.totalRevenue.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-gradient-to-br from-green-500/20 to-green-600/10 rounded-xl">
              <DollarSign className="w-6 h-6 text-green-400" />
            </div>
          </div>
        </SpotlightCard>

        <SpotlightCard className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm font-medium">Total Costs</p>
              <p className="text-3xl font-bold text-white mt-1">${overallStats.totalCost.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-gradient-to-br from-red-500/20 to-red-600/10 rounded-xl">
              <Package className="w-6 h-6 text-red-400" />
            </div>
          </div>
        </SpotlightCard>

        <SpotlightCard className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm font-medium">Net Profit</p>
              <p className={`text-3xl font-bold mt-1 ${overallStats.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                ${overallStats.profit.toLocaleString()}
              </p>
            </div>
            <div className="p-3 bg-gradient-to-br from-brand-orange/20 to-orange-600/10 rounded-xl">
              <TrendingUp className="w-6 h-6 text-brand-orange" />
            </div>
          </div>
        </SpotlightCard>

        <SpotlightCard className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm font-medium">Profit Margin</p>
              <p className={`text-3xl font-bold mt-1 ${overallStats.margin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {overallStats.margin.toFixed(1)}%
              </p>
            </div>
            <div className="p-3 bg-gradient-to-br from-purple-500/20 to-purple-600/10 rounded-xl">
              <Award className="w-6 h-6 text-purple-400" />
            </div>
          </div>
        </SpotlightCard>
      </div>

      {/* Category Performance Table */}
      <SpotlightCard className="p-6">
        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Package className="w-5 h-5 text-brand-orange" />
          Category Performance Analysis
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800/50 border-b border-white/10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-300 uppercase tracking-wider">Category</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-slate-300 uppercase tracking-wider">Orders</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-300 uppercase tracking-wider">Revenue</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-300 uppercase tracking-wider">Total Cost</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-300 uppercase tracking-wider">Profit</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-300 uppercase tracking-wider">Margin %</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-slate-300 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {categoryStats.map((cat, idx) => (
                <React.Fragment key={cat.name}>
                  <tr className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-sm font-semibold text-white flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: PATCH_TYPE_COLORS[cat.name] || '#64748b' }}
                      />
                      {cat.name}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-block bg-blue-500/20 text-blue-300 px-2 py-1 rounded text-xs font-semibold">
                        {cat.orders}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-green-400 font-bold">
                      ${cat.revenue.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-red-400 font-bold">
                      ${cat.totalCost.toLocaleString()}
                    </td>
                    <td className={`px-4 py-3 text-sm text-right font-bold ${cat.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      ${cat.profit.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <span className={`px-2 py-1 rounded font-bold ${
                        cat.margin >= 30 ? 'bg-emerald-500/20 text-emerald-400' :
                        cat.margin >= 20 ? 'bg-amber-500/20 text-amber-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {cat.margin.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setExpandedCategory(expandedCategory === cat.name ? null : cat.name)}
                        className="p-1 hover:bg-white/10 rounded transition-colors"
                      >
                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedCategory === cat.name ? 'rotate-180' : ''}`} />
                      </button>
                    </td>
                  </tr>
                  {expandedCategory === cat.name && (
                    <tr>
                      <td colSpan={7} className="px-4 py-4 bg-slate-800/30">
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-slate-400 text-xs mb-1">Production Cost</p>
                            <p className="text-white font-semibold">${cat.productionCost.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 text-xs mb-1">Shipping Cost</p>
                            <p className="text-white font-semibold">${cat.shippingCost.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 text-xs mb-1">Marketing Cost</p>
                            <p className="text-white font-semibold">${cat.marketingCost.toLocaleString()}</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </SpotlightCard>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Profit Chart */}
        <SpotlightCard className="p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Profit by Category</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={categoryStats}>
              <XAxis dataKey="name" stroke="#cbd5e1" style={{ fontSize: '12px' }} />
              <YAxis stroke="#cbd5e1" style={{ fontSize: '12px' }} tickFormatter={(v) => `$${v}`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="profit" radius={[6, 6, 0, 0]}>
                {categoryStats.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={PATCH_TYPE_COLORS[entry.name] || '#64748b'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </SpotlightCard>

        {/* Quantity Band Analysis */}
        <SpotlightCard className="p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Profit by Order Size</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={quantityBandStats}>
              <XAxis dataKey="label" stroke="#cbd5e1" style={{ fontSize: '12px' }} />
              <YAxis stroke="#cbd5e1" style={{ fontSize: '12px' }} tickFormatter={(v) => `${v}%`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="margin" radius={[6, 6, 0, 0]} fill="#FB6E1D" />
            </BarChart>
          </ResponsiveContainer>
        </SpotlightCard>
      </div>

      {/* Top 10 & Bottom 10 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 10 Best Orders */}
        <SpotlightCard className="p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-emerald-400" />
            Top 10 Best Orders
          </h3>
          <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
            {topOrders.map((order, idx) => (
              <div
                key={order.id}
                onClick={() => navigate(`/order/${order.orderNumber}`)}
                className="flex items-center justify-between p-3 bg-slate-800/50 hover:bg-slate-800 rounded-lg cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-400">#{idx + 1}</span>
                  <div>
                    <p className="text-sm font-semibold text-white group-hover:text-brand-orange transition-colors">
                      {order.orderNumber}
                    </p>
                    <p className="text-xs text-slate-400">{order.customerName}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-emerald-400">${order.profit.toLocaleString()}</p>
                  <p className="text-xs text-slate-400">{order.margin.toFixed(1)}% margin</p>
                </div>
              </div>
            ))}
          </div>
        </SpotlightCard>

        {/* Bottom 10 Worst Orders */}
        <SpotlightCard className="p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400" />
            Bottom 10 Worst Orders
          </h3>
          <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
            {worstOrders.map((order, idx) => (
              <div
                key={order.id}
                onClick={() => navigate(`/order/${order.orderNumber}`)}
                className="flex items-center justify-between p-3 bg-slate-800/50 hover:bg-slate-800 rounded-lg cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-400">#{idx + 1}</span>
                  <div>
                    <p className="text-sm font-semibold text-white group-hover:text-brand-orange transition-colors">
                      {order.orderNumber}
                    </p>
                    <p className="text-xs text-slate-400">{order.customerName}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${order.profit >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                    ${order.profit.toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-400">{order.margin.toFixed(1)}% margin</p>
                </div>
              </div>
            ))}
          </div>
        </SpotlightCard>
      </div>
    </div>
  );
};

export default ProductMixAnalysis;
