import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { supabase } from '../services/supabaseClient';
import { logger } from '../services/logger';
import { Order, UserRole } from '../types';
import { sanitizeOrFilterValue } from '../utils/supabaseFilters';
import { mapDbToOrder } from '../services/orderService';
import { getCustomerById, getCustomerByEmail, updateCustomer, Customer } from '../services/customersService';
import { getPremiumStatus, setPremiumStatus } from '../services/customerFlagsService';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import Spinner from '../components/ui/Spinner';
import Button from '../components/ui/Button';
import PremiumBadge from '../components/ui/PremiumBadge';
import CustomerOrderHistory from '../components/customers/CustomerOrderHistory';
import { ArrowLeft, Crown, AlertCircle, Save, X } from 'lucide-react';

interface FormValues {
  fullName: string;
  email: string;
  phone: string;
  defaultShippingAddress: string;
  country: string;
  companyName: string;
  notes: string;
}

const inputClass =
  'w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-orange/50 transition-colors';
const labelClass = 'block text-xs font-medium text-slate-400 mb-1.5';

const CustomerAccountPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, role, permissions } = useAuth();
  const { success: showSuccess, error: showError } = useToast();
  const queryClient = useQueryClient();

  const { data: customer, isLoading, error } = useQuery<Customer | null, Error>({
    queryKey: ['customer-account', id],
    queryFn: () => getCustomerById(id!),
    enabled: !!id,
  });

  const { data: orders = [], isLoading: ordersLoading } = useQuery<Order[], Error>({
    queryKey: ['customer-account-orders', customer?.email, customer?.phone],
    queryFn: async () => {
      const orFilters = [`customer_email.eq.${sanitizeOrFilterValue(customer!.email)}`];
      if (customer!.phone) {
        orFilters.push(`customer_phone.eq.${sanitizeOrFilterValue(customer!.phone)}`);
      }
      const { data, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .or(orFilters.join(','))
        .order('created_at', { ascending: false });
      if (ordersError) {
        logger.error('[CustomerAccountPage] orders query failed', ordersError);
        throw ordersError;
      }
      return (data || []).map(mapDbToOrder);
    },
    enabled: !!customer?.email,
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { isDirty, errors },
  } = useForm<FormValues>({
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      defaultShippingAddress: '',
      country: '',
      companyName: '',
      notes: '',
    },
  });

  useEffect(() => {
    if (customer) {
      reset({
        fullName: customer.fullName || '',
        email: customer.email || '',
        phone: customer.phone || '',
        defaultShippingAddress: customer.defaultShippingAddress || '',
        country: customer.country || '',
        companyName: customer.companyName || '',
        notes: customer.notes || '',
      });
    }
  }, [customer, reset]);

  // Warn (don't silently allow) if the edited email already belongs to a different account.
  const watchEmail = watch('email');
  const [emailCollision, setEmailCollision] = useState<Customer | null>(null);
  useEffect(() => {
    if (!customer) return;
    const trimmed = (watchEmail || '').trim().toLowerCase();
    const original = customer.email.trim().toLowerCase();
    if (!trimmed || trimmed === original) {
      setEmailCollision(null);
      return;
    }
    const timer = setTimeout(async () => {
      const match = await getCustomerByEmail(trimmed);
      setEmailCollision(match && match.id !== customer.id ? match : null);
    }, 500);
    return () => clearTimeout(timer);
  }, [watchEmail, customer]);

  const updateMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!id) throw new Error('Missing customer id');
      await updateCustomer(
        id,
        {
          fullName: values.fullName.trim() || null,
          email: values.email.trim(),
          phone: values.phone.trim() || null,
          defaultShippingAddress: values.defaultShippingAddress.trim() || null,
          country: values.country.trim() || null,
          companyName: values.companyName.trim() || null,
          notes: values.notes.trim() || null,
        } as any,
        user?.email ?? 'unknown'
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-account', id] });
      queryClient.invalidateQueries({ queryKey: ['customers-portal-list'] });
      showSuccess('Saved', "Customer's account details were updated.");
    },
    onError: (err: any) => showError('Failed to save', err?.message || 'Please try again.'),
  });

  const onSubmit = (values: FormValues) => {
    if (emailCollision) {
      showError(
        'Email already in use',
        `${emailCollision.email} already belongs to another account (${emailCollision.fullName || 'unnamed'}). Merge manually instead of saving a duplicate.`
      );
      return;
    }
    updateMutation.mutate(values);
  };

  // --- PREMIUM CUSTOMER FLAG (same pattern as CustomerHistoryPage / OrderPage) ---
  const canTogglePremium = role === UserRole.ADMIN || permissions?.orders_create === true;
  const { data: premiumFlag } = useQuery({
    queryKey: ['customer-premium', customer?.email],
    queryFn: () => getPremiumStatus(customer!.email),
    enabled: !!customer?.email,
  });
  const togglePremiumMutation = useMutation({
    mutationFn: async (next: boolean) => {
      if (!customer?.email) throw new Error('No customer email found');
      await setPremiumStatus(customer.email, next, user?.email ?? 'unknown');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-premium', customer?.email] });
      showSuccess(premiumFlag?.isPremium ? 'Premium flag removed' : 'Marked as Premium Customer');
    },
    onError: (err: any) => showError('Failed to update', err?.message || 'Could not update premium status.'),
  });

  const handleGoBack = () => navigate('/portal-customers');

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <Spinner />
          <p className="text-slate-400 mt-4">Loading customer account...</p>
        </div>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="p-10 text-center flex flex-col items-center justify-center h-[60vh] text-slate-400">
        <h2 className="text-xl font-bold text-white mb-2">Customer Not Found</h2>
        <p>No customer account exists for this id.</p>
        <button
          onClick={handleGoBack}
          className="mt-6 px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-white font-medium transition-colors"
        >
          Go Back to Customers
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen pb-20">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-gradient-to-br from-brand-orange/20 to-pink-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] bg-gradient-to-br from-purple-500/15 to-blue-500/15 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }} />
      </div>

      <div className="relative z-10 p-6 max-w-7xl mx-auto space-y-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <button
            onClick={handleGoBack}
            className="flex items-center gap-2 text-slate-400 hover:text-brand-orange mb-6 transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span className="font-medium">Back to Customers</span>
          </button>

          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-white">{customer.fullName || customer.email}</h1>
            {premiumFlag?.isPremium && <PremiumBadge size="md" />}
            {canTogglePremium && (
              <Button
                variant="secondary"
                size="sm"
                disabled={togglePremiumMutation.isPending}
                onClick={() => togglePremiumMutation.mutate(!premiumFlag?.isPremium)}
                className={
                  premiumFlag?.isPremium
                    ? 'bg-amber-400/10 text-amber-300 border-amber-400/30 hover:bg-amber-400/20'
                    : 'bg-slate-700/40 text-slate-300 border-slate-600 hover:bg-slate-700/60'
                }
                title={premiumFlag?.isPremium ? 'Remove Premium flag' : 'Mark this customer as Premium — production will apply extra QA/QC'}
              >
                <Crown size={14} />
                {togglePremiumMutation.isPending ? 'Saving…' : premiumFlag?.isPremium ? 'Unmark' : 'Mark as Premium'}
              </Button>
            )}
          </div>
          <p className="text-slate-400 text-sm">{customer.email}</p>
        </motion.div>

        {/* DETAILS PANEL */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-orange to-pink-500 rounded-2xl opacity-0 group-hover:opacity-30 blur transition duration-500" />
          <div className="relative bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
            <h3 className="text-lg font-bold text-white mb-1">Account Details</h3>
            <p className="text-xs text-slate-400 mb-5">
              Updates this customer's default details. Existing orders keep the address they were placed with; new orders will use these details.
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Full Name</label>
                  <input type="text" className={inputClass} {...register('fullName')} />
                </div>
                <div>
                  <label className={labelClass}>Email</label>
                  <input
                    type="email"
                    className={inputClass}
                    {...register('email', { required: 'Email is required' })}
                  />
                  {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email.message}</p>}
                  {emailCollision && (
                    <div className="mt-2 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 flex items-start gap-2">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-amber-200">
                        Already used by {emailCollision.fullName || emailCollision.email}. Saving is blocked — merge accounts manually instead.
                      </p>
                    </div>
                  )}
                </div>
                <div>
                  <label className={labelClass}>Phone</label>
                  <input type="text" className={inputClass} {...register('phone')} />
                </div>
                <div>
                  <label className={labelClass}>Country</label>
                  <input type="text" className={inputClass} {...register('country')} />
                </div>
                <div>
                  <label className={labelClass}>Company</label>
                  <input type="text" className={inputClass} {...register('companyName')} />
                </div>
                <div>
                  <label className={labelClass}>Default Shipping Address</label>
                  <input type="text" className={inputClass} {...register('defaultShippingAddress')} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Internal Notes</label>
                <textarea rows={3} className={inputClass} {...register('notes')} />
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!isDirty || updateMutation.isPending}
                  onClick={() =>
                    reset({
                      fullName: customer.fullName || '',
                      email: customer.email || '',
                      phone: customer.phone || '',
                      defaultShippingAddress: customer.defaultShippingAddress || '',
                      country: customer.country || '',
                      companyName: customer.companyName || '',
                      notes: customer.notes || '',
                    })
                  }
                  icon={<X size={14} />}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={!isDirty || updateMutation.isPending || !!emailCollision}
                  isLoading={updateMutation.isPending}
                  icon={<Save size={14} />}
                >
                  Save Changes
                </Button>
              </div>
            </form>
          </div>
        </motion.div>

        {ordersLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <CustomerOrderHistory orders={orders} />
        )}
      </div>
    </div>
  );
};

export default CustomerAccountPage;
