import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { OrderSummary } from '../types';
import { Link, useSearchParams } from 'react-router-dom';
import Spinner from '../components/ui/Spinner';
import { getStatusInfo } from '../constants';
import StatusFilter from '../components/ui/StatusFilter';
import { Package, Search, Plus, X, AlertTriangle } from 'lucide-react';
import { useDebounce } from '../hooks';

const ORDERS_PER_PAGE = 15;

const fetchOrders = async (page: number, status: string, isUrgent: boolean, searchTerm: string, paymentStatus: string | null) => {
  const from = page * ORDERS_PER_PAGE;
  const to = from + ORDERS_PER_PAGE - 1;

  let query = supabase
    .from('orders')
    .select(`
      orderNumber:order_number, 
      customerName:customer_name, 
      salesAgent:sales_agent, 
      status, 
      orderAmount:order_amount, 
      createdAt:created_at, 
      is_urgent
    `, { count: 'exact' })
    .order('created_at', { ascending: false });

  if (status !== 'ALL') {
    query = query.eq('status', status);
  }

  if (isUrgent) {
    query = query.eq('is_urgent', true);
  }

  if (searchTerm) {
    query = query.or(`order_number.ilike.%${searchTerm}%,customer_name.ilike.%${searchTerm}%,customer_email.ilike.%${searchTerm}%`);
  }

  if (paymentStatus === 'pending') {
    query = query.gt('amount_remaining', 0);
  }

  const { data, error, count } = await query
    .range(from, to);

  if (error) throw error;

  return { orders: data as OrderSummary[], count: count || 0 };
};

const AllOrdersPage: React.FC = () => {
  const [page, setPage] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const statusFilter = searchParams.get('status') || 'ALL';
  const isUrgentFilter = searchParams.get('filter') === 'urgent' || false;
  const paymentStatusFilter = searchParams.get('payment_status');


  const toggleUrgentFilter = () => {
    const newParams = new URLSearchParams(searchParams);
    isUrgentFilter ? newParams.delete('filter') : newParams.set('filter', 'urgent');
    setSearchParams(newParams);
  };

  const handleStatusChange = (newStatus: string) => {
    const newParams = new URLSearchParams(searchParams);
    newStatus === 'ALL' ? newParams.delete('status') : newParams.set('status', newStatus);
    setSearchParams(newParams);
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['allOrders', page, statusFilter, isUrgentFilter, debouncedSearchTerm, paymentStatusFilter],
    queryFn: () => fetchOrders(page, statusFilter, isUrgentFilter, debouncedSearchTerm, paymentStatusFilter),
    placeholderData: (previousData) => previousData,
    initialData: { orders: [], count: 0 },
  });

  const totalPages = useMemo(() => {
    return data.count ? Math.ceil(data.count / ORDERS_PER_PAGE) : 0;
  }, [data.count]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Left: Title with properly aligned icon */}
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Package className="w-6 h-6 text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">All Orders</h1>
          </div>
          <div>
            <p className="text-slate-400">Browse, search, and manage all orders.</p>
          </div>
        </div>
        
        {/* Right: Search and Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Properly aligned search */}
          <div className="relative w-full sm:w-64">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full rounded-lg border border-slate-700 bg-slate-800 py-2 pl-10 pr-3 text-slate-300 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:text-sm"
              placeholder="Search by Order #, Name, Email..."
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-0 flex items-center pr-3">
                <X className="h-4 w-4 text-slate-400 hover:text-white" />
              </button>
            )}
          </div>
          
          {/* Action buttons */}
          <div className="flex gap-2">
            <button 
              onClick={toggleUrgentFilter}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${isUrgentFilter ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-slate-800 text-slate-300 border-slate-700'} border hover:border-blue-500`}
            >
              <AlertTriangle className="w-4 h-4" /> Urgent
            </button>
            <StatusFilter selectedStatus={statusFilter} onStatusChange={handleStatusChange} />
            <Link to="/new-order" className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-lg text-white hover:bg-blue-700 text-sm font-semibold">
              <Plus className="w-4 h-4" /> New Order
            </Link>
          </div>
        </div>
      </div>

      <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl shadow-lg shadow-black/10">
        {isLoading && (
          <div className="flex justify-center items-center h-96">
            <Spinner />
          </div>
        )}
        {error && <div className="p-8 text-center text-red-400">Failed to load orders: {(error as Error).message}</div>}
        
        {!isLoading && !error && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-left text-slate-300">
              <thead className="text-xs text-slate-400 uppercase bg-slate-800/50">
                <tr>
                  <th className="px-4 py-3">Order ID</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Sales Agent</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {data.orders.map((order: OrderSummary) => (
                  <tr
                    key={order.orderNumber}
                    className={`transition-colors duration-200 ${
                      order.is_urgent
                        ? 'bg-red-900/30 hover:bg-red-900/40'
                        : 'hover:bg-slate-800/50'
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-blue-400">
                      <Link to={`/order/${order.orderNumber}`}>{`#${order.orderNumber}`}</Link>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{new Date(order.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 font-medium text-slate-100">{order.customerName}</td>
                    <td className="px-4 py-3">{order.salesAgent}</td>
                    <td className={`px-4 py-3 font-semibold ${getStatusInfo(order.status).textColor}`}>
                      {getStatusInfo(order.status).label}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">${order.orderAmount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        <div className="flex items-center justify-between p-4 border-t border-slate-700/50">
          <span className="text-sm text-slate-400">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(old => Math.max(old - 1, 0))}
              disabled={page === 0}
              className="px-3 py-1 rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(old => (data.orders.length === ORDERS_PER_PAGE ? old + 1 : old))}
              disabled={page + 1 >= totalPages}
              className="px-3 py-1 rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AllOrdersPage;