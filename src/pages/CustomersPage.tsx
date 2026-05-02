import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import Spinner from '@/components/ui/Spinner';
import { useToast } from '@/hooks/useToast';
import {
  Users,
  UserPlus,
  Mail,
  CheckCircle,
  Clock,
  Package,
  Search,
  X,
  Send,
  ShoppingBag,
} from 'lucide-react';

interface CustomerProfile {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

interface CustomerWithOrders extends CustomerProfile {
  order_count: number;
  total_spent: number;
  last_order_at: string | null;
}

const CustomersPage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Fetch all customer profiles with their order stats
  const { data: customers = [], isLoading, refetch } = useQuery({
    queryKey: ['customers-portal-list'],
    queryFn: async (): Promise<CustomerWithOrders[]> => {
      const { data: profiles, error } = await supabase
        .from('customer_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!profiles?.length) return [];

      // Pull real auth login times via SECURITY DEFINER function
      // (auth.users.last_sign_in_at is the source of truth, not customer_profiles.last_login_at)
      const { data: loginTimes } = await supabase.rpc('get_customer_last_login_times');
      const loginMap = new Map<string, string | null>();
      (loginTimes || []).forEach((row: any) => {
        loginMap.set(row.customer_id, row.last_sign_in_at);
      });

      // Get order stats per customer email
      const emails = profiles.map((p) => p.email);
      const { data: orders } = await supabase
        .from('orders')
        .select('customer_email, order_amount, created_at')
        .in('customer_email', emails);

      return profiles.map((profile) => {
        const customerOrders = (orders || []).filter(
          (o) => o.customer_email === profile.email
        );
        const total_spent = customerOrders.reduce(
          (sum, o) => sum + (o.order_amount || 0),
          0
        );
        const last_order_at =
          customerOrders.length > 0
            ? customerOrders.sort(
                (a, b) =>
                  new Date(b.created_at).getTime() -
                  new Date(a.created_at).getTime()
              )[0].created_at
            : null;

        // Use auth-tracked login time as source of truth, fall back to profile column
        const real_last_login = loginMap.get(profile.id) ?? profile.last_login_at;

        return {
          ...profile,
          last_login_at: real_last_login,
          order_count: customerOrders.length,
          total_spent,
          last_order_at,
        };
      });
    },
  });

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.email.toLowerCase().includes(q) ||
      (c.full_name || '').toLowerCase().includes(q) ||
      (c.company_name || '').toLowerCase().includes(q)
    );
  });

  const stats = {
    total: customers.length,
    active: customers.filter((c) => c.last_login_at).length,
    neverLoggedIn: customers.filter((c) => !c.last_login_at).length,
    totalRevenue: customers.reduce((sum, c) => sum + c.total_spent, 0),
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      toast.error('Email required', 'Please enter a customer email.');
      return;
    }
    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('invite-customer', {
        body: {
          email: inviteEmail.trim().toLowerCase(),
          customer_name: inviteName.trim() || 'Customer',
          order_number: 'N/A',
          portal_url: window.location.origin,
        },
      });
      // Edge function returns 400 with { error: "message" } in body
      if (error || data?.error) {
        throw new Error(data?.error || error?.message || 'Please try again.');
      }
      toast.success('Invite sent!', `Portal invite sent to ${inviteEmail}.`);
      setShowInviteModal(false);
      setInviteEmail('');
      setInviteName('');
      refetch();
    } catch (err: any) {
      toast.error('Failed to send invite', err.message || 'Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Customer Portal</h1>
          <p className="text-slate-400 text-sm mt-1">
            Manage customer accounts and portal access
          </p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-orange hover:bg-brand-orange/90 text-white rounded-lg text-sm font-medium transition-all"
        >
          <UserPlus className="w-4 h-4" />
          Invite Customer
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Total Customers',
            value: stats.total,
            icon: Users,
            color: 'text-blue-400',
            bg: 'bg-blue-500/10',
          },
          {
            label: 'Portal Active',
            value: stats.active,
            icon: CheckCircle,
            color: 'text-green-400',
            bg: 'bg-green-500/10',
          },
          {
            label: 'Never Logged In',
            value: stats.neverLoggedIn,
            icon: Clock,
            color: 'text-amber-400',
            bg: 'bg-amber-500/10',
          },
          {
            label: 'Total Revenue',
            value: formatCurrency(stats.totalRevenue),
            icon: ShoppingBag,
            color: 'text-brand-orange',
            bg: 'bg-brand-orange/10',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-slate-800/50 border border-white/5 rounded-xl p-4"
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.bg}`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-xs text-slate-400">{stat.label}</p>
                <p className="text-xl font-bold text-white">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search by name, email, or company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-slate-800/50 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-orange/50 transition-colors"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-slate-800/50 border border-white/5 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Users className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">
              {search ? 'No customers match your search' : 'No customers yet'}
            </p>
            {!search && (
              <p className="text-xs mt-1 text-slate-500">
                Customers appear here once they set up their portal account
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider hidden md:table-cell">
                    Company
                  </th>
                  <th className="text-center px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Orders
                  </th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider hidden lg:table-cell">
                    Total Spent
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider hidden lg:table-cell">
                    Last Login
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((customer) => (
                  <tr
                    key={customer.id}
                    className="hover:bg-white/3 transition-colors"
                  >
                    {/* Customer */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-brand-orange/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-brand-orange text-sm font-semibold">
                            {(customer.full_name || customer.email)[0].toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">
                            {customer.full_name || '—'}
                          </p>
                          <p className="text-xs text-slate-400 flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {customer.email}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Company */}
                    <td className="px-5 py-4 hidden md:table-cell">
                      <span className="text-sm text-slate-300">
                        {customer.company_name || '—'}
                      </span>
                    </td>

                    {/* Orders */}
                    <td className="px-5 py-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Package className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-sm font-medium text-white">
                          {customer.order_count}
                        </span>
                      </div>
                    </td>

                    {/* Total Spent */}
                    <td className="px-5 py-4 text-right hidden lg:table-cell">
                      <span className="text-sm font-semibold text-green-400">
                        {formatCurrency(customer.total_spent)}
                      </span>
                    </td>

                    {/* Last Login */}
                    <td className="px-5 py-4 hidden lg:table-cell">
                      <span className="text-sm text-slate-400">
                        {formatDate(customer.last_login_at)}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-4">
                      {customer.last_login_at ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          Pending
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowInviteModal(false)}
          />
          <div className="relative bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-brand-orange/10 rounded-lg">
                  <UserPlus className="w-5 h-5 text-brand-orange" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Invite Customer
                  </h2>
                  <p className="text-xs text-slate-400">
                    They'll receive an email to set their password
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowInviteModal(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="John Smith"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-orange/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Email Address <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  placeholder="customer@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                  className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-orange/50 transition-colors"
                />
              </div>

              <div className="bg-slate-800/50 rounded-lg p-3 flex items-start gap-2.5">
                <Mail className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-slate-400">
                  Customer will receive a welcome email with a link to set their
                  password and access the portal.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowInviteModal(false)}
                className="flex-1 px-4 py-2.5 border border-white/10 text-slate-300 hover:text-white hover:border-white/20 rounded-lg text-sm font-medium transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleInvite}
                disabled={isSending || !inviteEmail.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-orange hover:bg-brand-orange/90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-all"
              >
                {isSending ? (
                  <Spinner size="sm" />
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send Invite
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomersPage;
