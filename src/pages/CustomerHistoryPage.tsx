import React, { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { supabase } from '../services/supabaseClient';
import { Order, OrderStatus } from '../types';
import Spinner from '../components/ui/Spinner';
import { mapDbToOrder } from '../services/orderService';
import StatusBadge from '../components/ui/StatusBadge';
import { ArrowLeft, Mail, Phone, DollarSign, ShoppingBag, Clock, TrendingUp } from 'lucide-react';

const CustomerHistoryPage: React.FC = () => {
  const { identifier } = useParams<{ identifier: string }>();
  const navigate = useNavigate();
  
  const customerId = decodeURIComponent(identifier || '').trim();

  console.log('🔍 Looking up customer:', customerId);

  const { data: orders, isLoading, error } = useQuery<Order[], Error>({
    queryKey: ['customer_history', customerId],
    queryFn: async () => {
      if (!customerId) {
        console.log('❌ No customer ID provided');
        return [];
      }

      console.log('🔎 Querying database for:', customerId);

      const { data, error, count } = await supabase
        .from('orders')
        .select('*', { count: 'exact' })
        .or(`customer_email.eq.${customerId},customer_phone.eq.${customerId}`)
        .order('created_at', { ascending: false });

      console.log('📊 Query result:', { data, error, count });

      if (error) {
        console.error('❌ Database error:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        console.log('⚠️ No orders found for this customer');
        return [];
      }

      console.log('✅ Mapping orders...');
      return (data || []).map(mapDbToOrder);
    },
    enabled: !!customerId,
    retry: 1,
  });

  const metrics = useMemo(() => {
    if (!orders || orders.length === 0) return null;

    const totalSpent = orders.reduce((sum, o) => sum + (o.orderAmount || 0), 0);
    const totalPaid = orders.reduce((sum, o) => sum + (o.amountPaid || 0), 0);
    const orderCount = orders.length;
    const lastOrderDate = orders[0]?.createdAt 
      ? format(new Date(orders[0].createdAt), 'MMM dd, yyyy') 
      : 'N/A';
    
    const profile = {
      name: orders[0]?.customerName || 'Unknown',
      email: orders[0]?.customerEmail || '',
      phone: orders[0]?.customerPhone || '',
      shipping: orders[0]?.shippingAddress || '',
    };

    const uniqueEmails = [...new Set(
      orders
        .map(o => o.customerEmail)
        .filter(Boolean)
    )];

    const uniquePhones = [...new Set(
      orders
        .map(o => o.customerPhone)
        .filter(Boolean)
    )];

    return { 
      totalSpent, 
      totalPaid,
      orderCount, 
      lastOrderDate, 
      profile, 
      uniqueEmails,
      uniquePhones 
    };
  }, [orders]);

  const handleGoBack = () => {
    navigate('/orders');
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <Spinner />
          <p className="text-slate-400 mt-4">Loading customer history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    console.error('❌ Error loading customer history:', error);
    return (
      <div className="p-10 text-center flex flex-col items-center justify-center h-[60vh] text-slate-400">
        <h2 className="text-xl font-bold text-white mb-2">Error Loading History</h2>
        <p className="text-red-400 mb-2">{error.message}</p>
        <p>Customer ID: <span className="text-brand-orange font-mono">{customerId}</span></p>
        <button 
          onClick={handleGoBack} 
          className="mt-6 px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-white font-medium transition-colors"
        >
          Go Back to Orders
        </button>
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="p-10 text-center flex flex-col items-center justify-center h-[60vh] text-slate-400">
        <h2 className="text-xl font-bold text-white mb-2">No History Found</h2>
        <p>No orders found for: <span className="text-brand-orange font-mono">{customerId}</span></p>
        <p className="text-xs text-slate-500 mt-2">
          This customer may not exist, or the identifier is incorrect.
        </p>
        <button 
          onClick={handleGoBack} 
          className="mt-6 px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-white font-medium transition-colors"
        >
          Go Back to Orders
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen pb-20">
      {/* Background Glows - Matching Dashboard */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-gradient-to-br from-brand-orange/20 to-pink-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] bg-gradient-to-br from-purple-500/15 to-blue-500/15 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }} />
        <div className="absolute bottom-0 left-1/2 w-[550px] h-[550px] bg-gradient-to-br from-cyan-500/10 to-teal-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '12s', animationDelay: '4s' }} />
      </div>

      <div className="relative z-10 p-6 max-w-7xl mx-auto space-y-8">
        
        {/* HEADER */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <button 
            onClick={handleGoBack} 
            className="flex items-center gap-2 text-slate-400 hover:text-brand-orange mb-6 transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> 
            <span className="font-medium">Back to Orders</span>
          </button>
          
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-orange to-pink-500 rounded-2xl opacity-0 group-hover:opacity-30 blur transition duration-500" />
            <div className="relative bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <h1 className="text-3xl font-bold text-white">
                      {metrics?.profile.name}
                    </h1>
                    <span className="text-xs font-semibold bg-brand-green/10 text-brand-green border border-brand-green/20 px-3 py-1 rounded-full">
                      Tracked Customer
                    </span>
                  </div>
                  
                  <div className="flex flex-col gap-3 mt-4">
                    {/* EMAIL LIST */}
                    {metrics && metrics.uniqueEmails.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2 text-slate-400">
                          <Mail className="w-4 h-4 text-sky-400" />
                          <span className="text-xs font-semibold uppercase tracking-wider">Email:</span>
                        </div>
                        {metrics.uniqueEmails.map((email) => (
                          <span 
                            key={email} 
                            className={`px-3 py-1.5 text-sm rounded-lg border font-medium ${
                              email === metrics.profile.email 
                                ? 'bg-sky-500/10 border-sky-500/30 text-sky-300' 
                                : 'bg-slate-800/50 border-slate-700/50 text-slate-400'
                            }`}
                          >
                            {email}
                          </span>
                        ))}
                      </div>
                    )}
                    
                    {/* PHONE LIST */}
                    {metrics && metrics.uniquePhones.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2 text-slate-400">
                          <Phone className="w-4 h-4 text-emerald-400" />
                          <span className="text-xs font-semibold uppercase tracking-wider">Phone:</span>
                        </div>
                        {metrics.uniquePhones.map((phone) => (
                          <span 
                            key={phone} 
                            className={`px-3 py-1.5 text-sm rounded-lg border font-mono ${
                              phone === metrics.profile.phone 
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                                : 'bg-slate-800/50 border-slate-700/50 text-slate-400'
                            }`}
                          >
                            {phone}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-slate-500 mb-2 uppercase tracking-wider font-bold">
                    Customer Status
                  </div>
                  <div className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold border ${
                    metrics?.orderCount === 1 
                      ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' 
                      : 'bg-purple-500/10 border-purple-500/20 text-purple-400'
                  }`}>
                    <TrendingUp className="w-4 h-4" />
                    {metrics?.orderCount === 1 ? 'New Customer' : 'Repeat Customer'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* METRICS CARDS - Matching Dashboard Style */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {/* Lifetime Value Card */}
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl opacity-0 group-hover:opacity-30 blur transition duration-500" />
            <div className="relative bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-500/10 rounded-xl">
                  <DollarSign className="w-8 h-8 text-emerald-400" />
                </div>
                <div>
                  <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">Lifetime Value</p>
                  <p className="text-3xl font-bold text-white mt-1">
                    ${metrics?.totalSpent.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Total Orders Card */}
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl opacity-0 group-hover:opacity-30 blur transition duration-500" />
            <div className="relative bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-500/10 rounded-xl">
                  <ShoppingBag className="w-8 h-8 text-purple-400" />
                </div>
                <div>
                  <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">Total Orders</p>
                  <p className="text-3xl font-bold text-white mt-1">{metrics?.orderCount}</p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Last Active Card */}
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-orange to-orange-500 rounded-2xl opacity-0 group-hover:opacity-30 blur transition duration-500" />
            <div className="relative bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-brand-orange/10 rounded-xl">
                  <Clock className="w-8 h-8 text-brand-orange" />
                </div>
                <div>
                  <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">Last Active</p>
                  <p className="text-2xl font-bold text-white mt-1">{metrics?.lastOrderDate}</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* HISTORY TABLE */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="relative group"
        >
          <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl opacity-0 group-hover:opacity-30 blur transition duration-500" />
          <div className="relative bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl overflow-hidden">
            <div className="px-6 py-5 border-b border-white/10">
              <h3 className="text-lg font-bold text-white">Order History</h3>
              <p className="text-sm text-slate-400 mt-1">Complete transaction history for this customer</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900/50 text-xs uppercase font-semibold tracking-wider text-slate-500">
                  <tr>
                    <th className="px-6 py-4">Order ID</th>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Design</th>
                    <th className="px-6 py-4">Contact Used</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Amount</th>
                    <th className="px-6 py-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {orders.map((order) => (
                    <tr key={order.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4">
                        <button
                          onClick={() => navigate(`/order/${order.orderNumber}`)}
                          className="font-mono font-bold text-brand-orange hover:text-orange-400 hover:underline transition-colors"
                        >
                          {order.orderNumber}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-slate-300">
                        {order.createdAt 
                          ? format(new Date(order.createdAt), 'MMM dd, yyyy') 
                          : 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-white font-medium">{order.designName || 'N/A'}</td>
                      <td className="px-6 py-4 text-xs">
                        {order.customerEmail && (
                          <div className="text-sky-300 mb-1">{order.customerEmail}</div>
                        )}
                        {order.customerPhone && (
                          <div className="text-slate-500">{order.customerPhone}</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={order.status as OrderStatus} />
                      </td>
                      <td className="px-6 py-4 text-right text-emerald-400 font-bold font-mono">
                        ${Number(order.orderAmount || 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => navigate(`/order/${order.orderNumber}`)}
                          className="px-3 py-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 hover:bg-blue-400/10 rounded-lg transition-colors"
                        >
                          VIEW
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default CustomerHistoryPage;