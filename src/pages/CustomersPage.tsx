import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/services/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { listCustomersPage, getCustomerStatsSummary } from '@/services/customersService';
import Spinner from '@/components/ui/Spinner';
import Button from '@/components/ui/Button';
import LoyaltyBadge from '@/components/ui/LoyaltyBadge';
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
  KeyRound,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';

const ITEMS_PER_PAGE = 20;

const CustomersPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all'); // all | none | bronze | silver | gold
  const [currentPage, setCurrentPage] = useState(1);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [isSending, setIsSending] = useState(false);
  // Detected existing customer info (null = brand new, object = returning)
  const [existingCustomer, setExistingCustomer] = useState<{
    full_name: string | null;
    last_login_at: string | null;
  } | null>(null);

  // Debounce search input -> query param, and reset back to page 1 whenever the search changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Paginated page of customer accounts + order stats. Only the current page's orders are
  // fetched (not the whole orders table) — keepPreviousData avoids a flash of empty state
  // while a new page loads.
  const {
    data: pageData,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['customers-portal-page', currentPage, debouncedSearch, tierFilter],
    queryFn: () => listCustomersPage({ page: currentPage, pageSize: ITEMS_PER_PAGE, search: debouncedSearch, loyaltyTier: tierFilter }),
    placeholderData: keepPreviousData,
  });

  const customers = pageData?.customers || [];
  const totalCount = pageData?.totalCount || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));

  // Global stats tiles — decoupled from pagination so paging doesn't refetch them.
  const { data: statsSummary } = useQuery({
    queryKey: ['customers-portal-stats'],
    queryFn: getCustomerStatsSummary,
    staleTime: 1000 * 60 * 5,
  });

  const stats = {
    total: statsSummary?.totalCustomers ?? 0,
    active: statsSummary?.portalActive ?? 0,
    neverLoggedIn: statsSummary?.neverLoggedIn ?? 0,
    totalRevenue: statsSummary?.totalRevenue ?? 0,
  };

  // Detect if email belongs to existing customer (debounced on email change)
  React.useEffect(() => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setExistingCustomer(null);
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('customer_profiles')
        .select('full_name, last_login_at')
        .eq('email', email)
        .maybeSingle();
      setExistingCustomer(data);
    }, 400);
    return () => clearTimeout(timer);
  }, [inviteEmail]);

  // mode: 'auto' = invite (new) or magic link (returning) | 'reset_password' = force password reset
  const handleSendInvite = async (mode: 'auto' | 'reset_password' = 'auto') => {
    if (!inviteEmail.trim()) {
      toast.error('Email required', 'Please enter a customer email.');
      return;
    }
    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('invite-customer', {
        body: {
          email: inviteEmail.trim().toLowerCase(),
          customer_name: inviteName.trim() || existingCustomer?.full_name || 'Customer',
          order_number: 'N/A',
          portal_url: 'https://login.pandapatches.com',
          mode,
        },
      });
      if (error || data?.error) {
        throw new Error(data?.error || error?.message || 'Please try again.');
      }
      const successMsg =
        mode === 'reset_password'
          ? `Password reset link sent to ${inviteEmail}.`
          : existingCustomer
          ? `Magic login link sent to ${inviteEmail}.`
          : `Welcome invite sent to ${inviteEmail}.`;
      toast.success('Email sent!', successMsg);
      setShowInviteModal(false);
      setInviteEmail('');
      setInviteName('');
      setExistingCustomer(null);
      refetch();
    } catch (err: any) {
      toast.error('Failed to send', err.message || 'Please try again.');
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

      {/* Search + tier filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, email, or company..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-slate-800/50 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-orange/50 transition-colors"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <select
          value={tierFilter}
          onChange={(e) => { setTierFilter(e.target.value); setCurrentPage(1); }}
          className="py-2.5 px-3 bg-slate-800/50 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-brand-orange/50 transition-colors"
          title="Filter by loyalty tier"
        >
          <option value="all">All tiers</option>
          <option value="none">No tier</option>
          <option value="bronze">Bronze</option>
          <option value="silver">Silver</option>
          <option value="gold">Gold</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-slate-800/50 border border-white/5 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Users className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">
              {debouncedSearch ? 'No customers match your search' : 'No customers yet'}
            </p>
            {!debouncedSearch && (
              <p className="text-xs mt-1 text-slate-400">
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
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider hidden md:table-cell">
                    Tier
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
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {customers.map((customer) => (
                  <tr
                    key={customer.id}
                    onClick={() => navigate(`/portal-customers/${customer.id}`)}
                    className="hover:bg-white/3 transition-colors cursor-pointer"
                  >
                    {/* Customer */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-brand-orange/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-brand-orange text-sm font-semibold">
                            {(customer.fullName || customer.email)[0].toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">
                            {customer.fullName || '—'}
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
                        {customer.companyName || '—'}
                      </span>
                    </td>

                    {/* Loyalty tier */}
                    <td className="px-5 py-4 hidden md:table-cell">
                      {customer.loyaltyTier !== 'none'
                        ? <LoyaltyBadge tier={customer.loyaltyTier} />
                        : <span className="text-sm text-slate-500">—</span>}
                    </td>

                    {/* Orders */}
                    <td className="px-5 py-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Package className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-sm font-medium text-white">
                          {customer.orderCount}
                        </span>
                      </div>
                    </td>

                    {/* Total Spent */}
                    <td className="px-5 py-4 text-right hidden lg:table-cell">
                      <span className="text-sm font-semibold text-green-400">
                        {formatCurrency(customer.totalSpent)}
                      </span>
                    </td>

                    {/* Last Login */}
                    <td className="px-5 py-4 hidden lg:table-cell">
                      <span className="text-sm text-slate-400">
                        {formatDate(customer.portalLastLoginAt)}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-4">
                      {customer.portalLastLoginAt ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                          Active
                        </span>
                      ) : customer.customerProfileId ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          Pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/10 text-slate-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                          Guest
                        </span>
                      )}
                    </td>

                    {/* View affordance */}
                    <td className="px-5 py-4 text-right">
                      <ChevronRight className="w-4 h-4 text-slate-500" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 pt-2">
          <Button
            variant="secondary"
            disabled={currentPage === 1 || isFetching}
            onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
            className="bg-slate-800 border border-slate-600 text-white hover:bg-slate-700 disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Previous
          </Button>

          <span className="text-slate-300 font-medium text-sm">
            Page <span className="text-white font-bold">{currentPage}</span> of {totalPages}
            <span className="text-slate-400 ml-2">({totalCount} customers)</span>
          </span>

          <Button
            variant="secondary"
            disabled={currentPage === totalPages || isFetching}
            onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
            className="bg-slate-800 border border-slate-600 text-white hover:bg-slate-700 disabled:opacity-50"
          >
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}

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
                  onKeyDown={(e) => e.key === 'Enter' && handleSendInvite('auto')}
                  className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-orange/50 transition-colors"
                />
              </div>

              {/* Context-aware info banner */}
              {existingCustomer ? (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-blue-200">
                    <p className="font-medium text-blue-300 mb-0.5">
                      This customer already has an account
                      {existingCustomer.full_name ? ` (${existingCustomer.full_name})` : ''}
                    </p>
                    <p className="text-blue-200/80">
                      Choose <span className="font-medium">Send Magic Link</span> for instant
                      login, or <span className="font-medium">Reset Password</span> if they
                      forgot their password.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-800/50 rounded-lg p-3 flex items-start gap-2.5">
                  <Mail className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-slate-400">
                    Customer will receive a welcome email with a link to set their
                    password and access the portal.
                  </p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowInviteModal(false)}
                className="px-4 py-2.5 border border-white/10 text-slate-300 hover:text-white hover:border-white/20 rounded-lg text-sm font-medium transition-all"
              >
                Cancel
              </button>

              {existingCustomer ? (
                <>
                  <button
                    onClick={() => handleSendInvite('reset_password')}
                    disabled={isSending || !inviteEmail.trim()}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-all"
                  >
                    {isSending ? (
                      <Spinner size="sm" />
                    ) : (
                      <>
                        <KeyRound className="w-4 h-4" />
                        Reset Password
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleSendInvite('auto')}
                    disabled={isSending || !inviteEmail.trim()}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-orange hover:bg-brand-orange/90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-all"
                  >
                    {isSending ? (
                      <Spinner size="sm" />
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Send Magic Link
                      </>
                    )}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => handleSendInvite('auto')}
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
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomersPage;
