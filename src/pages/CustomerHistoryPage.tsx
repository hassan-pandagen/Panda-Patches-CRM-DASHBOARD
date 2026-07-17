import React, { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { supabase } from '../services/supabaseClient';
import { logger } from '../services/logger';
import { Order, UserRole } from '../types';
import { queryKeys } from '../constants/queryKeys';
import Spinner from '../components/ui/Spinner';
import { mapDbToOrder } from '../services/orderService';
import { getPremiumStatus, setPremiumStatus } from '../services/customerFlagsService';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { sanitizeOrFilterValue } from '../utils/supabaseFilters';
import PremiumBadge from '../components/ui/PremiumBadge';
import Button from '../components/ui/Button';
import CustomerOrderHistory from '../components/customers/CustomerOrderHistory';
import { ArrowLeft, Mail, Phone, TrendingUp, Crown } from 'lucide-react';

const CustomerHistoryPage: React.FC = () => {
  const { identifier } = useParams<{ identifier: string }>();
  const navigate = useNavigate();
  const { user, role, permissions } = useAuth();
  const { success: showSuccess, error: showError } = useToast();
  const queryClient = useQueryClient();

  const customerId = decodeURIComponent(identifier || '').trim();

  logger.debug('[Customer History] Looking up customer', customerId);

  const { data: orders, isLoading, error } = useQuery<Order[], Error>({
    queryKey: queryKeys.customer.history(customerId),
    queryFn: async () => {
      if (!customerId) {
        logger.warn('[Customer History] No customer ID provided');
        return [];
      }

      logger.debug('[Customer History] Querying database for customer', customerId);

      const safeId = sanitizeOrFilterValue(customerId);
      const { data, error, count } = await supabase
        .from('orders')
        .select('*', { count: 'exact' })
        .or(`customer_email.eq.${safeId},customer_phone.eq.${safeId}`)
        .order('created_at', { ascending: false });

      logger.debug('[Customer History] Query result', { data, error, count });

      if (error) {
        logger.error('[Customer History] Database error', error);
        throw error;
      }

      if (!data || data.length === 0) {
        logger.info('[Customer History] No orders found for customer');
        return [];
      }

      logger.debug('[Customer History] Mapping orders...');
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

  // --- PREMIUM CUSTOMER FLAG ---
  const canTogglePremium = role === UserRole.ADMIN || permissions?.orders_create === true;
  const customerEmail = metrics?.profile.email || '';
  const { data: premiumFlag } = useQuery({
    queryKey: ['customer-premium', customerEmail],
    queryFn: () => getPremiumStatus(customerEmail),
    enabled: !!customerEmail,
  });
  const togglePremiumMutation = useMutation({
    mutationFn: async (next: boolean) => {
      if (!customerEmail) throw new Error('No customer email found');
      await setPremiumStatus(customerEmail, next, user?.email ?? 'unknown');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-premium', customerEmail] });
      showSuccess(premiumFlag?.isPremium ? 'Premium flag removed' : 'Marked as Premium Customer');
    },
    onError: (err: any) => showError('Failed to update', err?.message || 'Could not update premium status.'),
  });

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
    logger.error('[Customer History] Error loading customer history', error);
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
        <p className="text-xs text-slate-400 mt-2">
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
                    {premiumFlag?.isPremium && <PremiumBadge size="md" />}
                    {canTogglePremium && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={togglePremiumMutation.isPending}
                        onClick={() => togglePremiumMutation.mutate(!premiumFlag?.isPremium)}
                        className={premiumFlag?.isPremium
                          ? 'bg-amber-400/10 text-amber-300 border-amber-400/30 hover:bg-amber-400/20'
                          : 'bg-slate-700/40 text-slate-300 border-slate-600 hover:bg-slate-700/60'}
                        title={premiumFlag?.isPremium ? 'Remove Premium flag' : 'Mark this customer as Premium — production will apply extra QA/QC'}
                      >
                        <Crown size={14} />
                        {togglePremiumMutation.isPending ? 'Saving…' : premiumFlag?.isPremium ? 'Unmark' : 'Mark as Premium'}
                      </Button>
                    )}
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
                  <div className="text-xs text-slate-400 mb-2 uppercase tracking-wider font-bold">
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

        <CustomerOrderHistory orders={orders} />
      </div>
    </div>
  );
};

export default CustomerHistoryPage;