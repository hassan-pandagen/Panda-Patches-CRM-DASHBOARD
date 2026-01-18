import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { Order, OrderStatus } from '../types';
import { mapDbToOrder } from '../services/orderService';
import { queryKeys } from '../constants/queryKeys';
import Spinner from '../components/ui/Spinner';
import { DollarSign, Save, Calculator, Filter, Download, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { CSVLink } from 'react-csv';

interface CostEntry {
  orderId: number;
  orderNumber: string;
  productionCost: number;
  shippingCost: number;
  marketingCost: number;
}

const BulkCostEntryPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'month' | 'all'>('month');
  const [searchQuery, setSearchQuery] = useState('');
  const [editedCosts, setEditedCosts] = useState<Record<number, CostEntry>>({});
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());

  // Fetch all orders
  const { data: orders = [], isLoading } = useQuery({
    queryKey: queryKeys.orders.all(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []).map(mapDbToOrder);
    },
  });

  // Filter orders
  const filteredOrders = useMemo(() => {
    let result = orders;

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      result = result.filter(order => {
        const orderDate = new Date(order.createdAt);

        if (dateFilter === 'today') {
          return orderDate >= today;
        } else if (dateFilter === 'week') {
          const weekAgo = new Date(today);
          weekAgo.setDate(weekAgo.getDate() - 7);
          return orderDate >= weekAgo;
        } else if (dateFilter === 'month') {
          // Current calendar month
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          return orderDate >= monthStart;
        }
        return true;
      });
    }

    // Status filter
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'COMPLETED_SHIPPED') {
        result = result.filter(o =>
          o.status === OrderStatus.COMPLETED ||
          o.status === OrderStatus.SHIPPED ||
          o.status === OrderStatus.DELIVERED
        );
      } else {
        result = result.filter(o => o.status === statusFilter);
      }
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(o =>
        o.orderNumber.toLowerCase().includes(query) ||
        o.customerName.toLowerCase().includes(query)
      );
    }

    return result;
  }, [orders, dateFilter, statusFilter, searchQuery]);

  // Calculate totals and profit
  const stats = useMemo(() => {
    let totalRevenue = 0;
    let totalProductionCost = 0;
    let totalShippingCost = 0;
    let totalMarketingCost = 0;
    let ordersWithCosts = 0;

    filteredOrders.forEach(order => {
      const costs = editedCosts[order.id] || {
        productionCost: order.productionCost || 0,
        shippingCost: order.shippingCost || 0,
        marketingCost: order.marketingCost || 0,
      };

      // For refunded orders, use originalAmount (what customer paid before refund)
      // This shows the true revenue impact including costs you paid
      const revenue = order.status === 'REFUNDED'
        ? ((order as any).originalAmount || order.orderAmount || 0)
        : (order.orderAmount || 0);
      totalRevenue += revenue;
      totalProductionCost += costs.productionCost;
      totalShippingCost += costs.shippingCost;
      totalMarketingCost += costs.marketingCost;

      if (costs.productionCost > 0 || costs.shippingCost > 0 || costs.marketingCost > 0) {
        ordersWithCosts++;
      }
    });

    const totalCosts = totalProductionCost + totalShippingCost + totalMarketingCost;
    const totalProfit = totalRevenue - totalCosts;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return {
      totalRevenue,
      totalProductionCost,
      totalShippingCost,
      totalMarketingCost,
      totalCosts,
      totalProfit,
      profitMargin,
      ordersWithCosts,
      totalOrders: filteredOrders.length,
    };
  }, [filteredOrders, editedCosts]);

  // Update cost mutation
  const updateCostMutation = useMutation({
    mutationFn: async ({ orderId, costs }: { orderId: number; costs: CostEntry }) => {
      const { error } = await supabase
        .from('orders')
        .update({
          production_cost: costs.productionCost,
          shipping_cost: costs.shippingCost,
          marketing_cost: costs.marketingCost,
          profit: (orders.find(o => o.id === orderId)?.orderAmount || 0) -
                  (costs.productionCost + costs.shippingCost + costs.marketingCost),
        })
        .eq('id', orderId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all() });
      // Remove from edited state after successful save
      setEditedCosts(prev => {
        const newState = { ...prev };
        delete newState[variables.orderId];
        return newState;
      });
      setSavingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(variables.orderId);
        return newSet;
      });
    },
  });

  const handleCostChange = (orderId: number, field: keyof CostEntry, value: string) => {
    const numValue = parseFloat(value) || 0;
    const order = orders.find(o => o.id === orderId);

    setEditedCosts(prev => ({
      ...prev,
      [orderId]: {
        orderId,
        orderNumber: order?.orderNumber || '',
        productionCost: field === 'productionCost' ? numValue : (prev[orderId]?.productionCost || order?.productionCost || 0),
        shippingCost: field === 'shippingCost' ? numValue : (prev[orderId]?.shippingCost || order?.shippingCost || 0),
        marketingCost: field === 'marketingCost' ? numValue : (prev[orderId]?.marketingCost || order?.marketingCost || 0),
      }
    }));
  };

  const handleSave = async (orderId: number) => {
    const costs = editedCosts[orderId];
    if (!costs) return;

    setSavingIds(prev => new Set(prev).add(orderId));
    await updateCostMutation.mutateAsync({ orderId, costs });
  };

  const handleSaveAll = async () => {
    const entries = Object.entries(editedCosts);
    for (const [orderIdStr, costs] of entries) {
      const orderId = parseInt(orderIdStr);
      setSavingIds(prev => new Set(prev).add(orderId));
      await updateCostMutation.mutateAsync({ orderId, costs });
    }
  };

  // CSV Export
  const csvData = filteredOrders.map(order => {
    const costs = editedCosts[order.id] || {
      productionCost: order.productionCost || 0,
      shippingCost: order.shippingCost || 0,
      marketingCost: order.marketingCost || 0,
    };
    const totalCost = costs.productionCost + costs.shippingCost + costs.marketingCost;
    const profit = (order.orderAmount || 0) - totalCost;
    const margin = order.orderAmount ? (profit / order.orderAmount) * 100 : 0;

    return {
      'Order Number': order.orderNumber,
      'Customer': order.customerName,
      'Status': order.status,
      'Revenue': order.orderAmount || 0,
      'Production Cost': costs.productionCost,
      'Shipping Cost': costs.shippingCost,
      'Marketing Cost': costs.marketingCost,
      'Total Cost': totalCost,
      'Profit': profit,
      'Margin %': margin.toFixed(2),
    };
  });

  if (isLoading) return <Spinner fullScreen message="Loading orders..." />;

  return (
    <div className="relative min-h-screen pb-10">
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-brand-orange/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <h1 className="text-4xl font-bold text-white">Bulk Cost Entry</h1>
            <p className="text-slate-400 mt-2">Fill production, shipping, and marketing costs for orders</p>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleSaveAll}
              disabled={updateCostMutation.isPending || Object.keys(editedCosts).length === 0}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors ${
                Object.keys(editedCosts).length > 0
                  ? 'bg-brand-orange hover:bg-brand-orange/90 text-white'
                  : 'bg-slate-700 text-slate-400 cursor-not-allowed'
              } disabled:opacity-50`}
            >
              <Save className="w-4 h-4" />
              {Object.keys(editedCosts).length > 0
                ? `Save All (${Object.keys(editedCosts).length})`
                : 'Save All'}
            </button>
            <CSVLink
              data={csvData}
              filename={`cost-analysis-${new Date().toISOString().split('T')[0]}.csv`}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600/80 hover:bg-emerald-600 rounded-lg text-white font-semibold transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </CSVLink>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm font-medium">Total Revenue</p>
                <p className="text-3xl font-bold text-white mt-1">${stats.totalRevenue.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-gradient-to-br from-green-500/20 to-green-600/10 rounded-xl">
                <DollarSign className="w-6 h-6 text-green-400" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm font-medium">Total Costs</p>
                <p className="text-3xl font-bold text-white mt-1">${stats.totalCosts.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-gradient-to-br from-red-500/20 to-red-600/10 rounded-xl">
                <Calculator className="w-6 h-6 text-red-400" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm font-medium">Net Profit</p>
                <p className={`text-3xl font-bold mt-1 ${stats.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  ${stats.totalProfit.toLocaleString()}
                </p>
              </div>
              <div className="p-3 bg-gradient-to-br from-brand-orange/20 to-orange-600/10 rounded-xl">
                <TrendingUp className="w-6 h-6 text-brand-orange" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm font-medium">Profit Margin</p>
                <p className={`text-3xl font-bold mt-1 ${stats.profitMargin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {stats.profitMargin.toFixed(1)}%
                </p>
              </div>
              <div className="p-3 bg-gradient-to-br from-purple-500/20 to-purple-600/10 rounded-xl">
                <DollarSign className="w-6 h-6 text-purple-400" />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Filters */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Date Filter Buttons */}
            <div className="flex items-center gap-2 bg-slate-800/50 border border-slate-700 rounded-lg p-1">
              {(['today', 'week', 'month', 'all'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setDateFilter(filter)}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                    dateFilter === filter
                      ? 'bg-brand-orange text-white shadow-lg shadow-brand-orange/20'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>

            <div className="flex-1">
              <input
                type="text"
                placeholder="Search by order number or customer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-orange"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-orange"
              >
                <option value="ALL">All Status</option>
                <option value="COMPLETED_SHIPPED">Completed/Shipped</option>
                <option value={OrderStatus.IN_PRODUCTION}>In Production</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full min-w-[1400px]">
              <thead className="bg-slate-800/50 border-b border-white/10 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-4 text-left text-xs font-bold text-slate-300 uppercase tracking-wider w-32">Order #</th>
                  <th className="px-4 py-4 text-left text-xs font-bold text-slate-300 uppercase tracking-wider w-48">Customer</th>
                  <th className="px-4 py-4 text-left text-xs font-bold text-slate-300 uppercase tracking-wider w-32">Status</th>
                  <th className="px-4 py-4 text-right text-xs font-bold text-slate-300 uppercase tracking-wider w-28">Revenue</th>
                  <th className="px-4 py-4 text-right text-xs font-bold text-slate-300 uppercase tracking-wider w-32">Production $</th>
                  <th className="px-4 py-4 text-right text-xs font-bold text-slate-300 uppercase tracking-wider w-32">Shipping $</th>
                  <th className="px-4 py-4 text-right text-xs font-bold text-slate-300 uppercase tracking-wider w-32">Marketing $</th>
                  <th className="px-4 py-4 text-right text-xs font-bold text-slate-300 uppercase tracking-wider w-28">Total Cost</th>
                  <th className="px-4 py-4 text-right text-xs font-bold text-slate-300 uppercase tracking-wider w-28">Profit</th>
                  <th className="px-4 py-4 text-center text-xs font-bold text-slate-300 uppercase tracking-wider w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredOrders.map((order) => {
                  const costs = editedCosts[order.id] || {
                    productionCost: order.productionCost || 0,
                    shippingCost: order.shippingCost || 0,
                    marketingCost: order.marketingCost || 0,
                  };
                  const totalCost = costs.productionCost + costs.shippingCost + costs.marketingCost;
                  const profit = (order.orderAmount || 0) - totalCost;
                  const hasChanges = editedCosts[order.id] !== undefined;
                  const isSaving = savingIds.has(order.id);

                  return (
                    <tr key={order.id} className={`hover:bg-white/5 transition-colors ${hasChanges ? 'bg-brand-orange/5' : ''}`}>
                      <td className="px-4 py-3 text-sm font-medium text-white">{order.orderNumber}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{order.customerName}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className="px-2 py-1 bg-slate-700 text-slate-200 rounded text-xs">
                          {order.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-green-400 font-semibold">
                        ${(order.orderAmount || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          step="0.01"
                          value={costs.productionCost}
                          onChange={(e) => handleCostChange(order.id, 'productionCost', e.target.value)}
                          className="w-24 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand-orange"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          step="0.01"
                          value={costs.shippingCost}
                          onChange={(e) => handleCostChange(order.id, 'shippingCost', e.target.value)}
                          className="w-24 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand-orange"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          step="0.01"
                          value={costs.marketingCost}
                          onChange={(e) => handleCostChange(order.id, 'marketingCost', e.target.value)}
                          className="w-24 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand-orange"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-red-400 font-semibold">
                        ${totalCost.toLocaleString()}
                      </td>
                      <td className={`px-4 py-3 text-sm text-right font-bold ${profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        ${profit.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {hasChanges ? (
                          <button
                            onClick={() => handleSave(order.id)}
                            disabled={isSaving}
                            className="px-3 py-1.5 bg-brand-orange hover:bg-brand-orange/90 text-white rounded text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1 mx-auto"
                          >
                            <Save className="w-3 h-3" />
                            {isSaving ? 'Saving...' : 'Save'}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-600">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredOrders.length === 0 && (
            <div className="py-12 text-center text-slate-400">
              No orders found matching your filters
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BulkCostEntryPage;
