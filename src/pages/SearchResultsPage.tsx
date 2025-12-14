// src/pages/SearchResultsPage.tsx - FINAL THEME CONSISTENCY

import React from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { Order, OrderStatus, UserRole } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { queryKeys } from '../constants/queryKeys';
import { getStatusInfo } from '../constants';
import { Package, Lock, Search, ArrowRight } from 'lucide-react';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';

// Helper for Badge
const StatusBadge = ({ status }: { status: OrderStatus }) => {
  const config = getStatusInfo(status);
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 w-fit ${config.color} shadow-sm`}>
      {config.label}
    </span>
  );
};

const SearchResultsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  
  const { role, permissions } = useAuth();
  const canViewFinancials = role === UserRole.ADMIN || permissions?.orders_edit_financials || permissions?.view_financials;

  // --- FETCH SEARCH RESULTS ---
  const { data: results = [], isLoading } = useQuery({
    queryKey: queryKeys.search.results(query),
    queryFn: async () => {
      if (!query) return [];
      
      // Search multiple columns using Supabase 'or' syntax
      const searchTerm = `%${query}%`;
      const { data, error } = await supabase
        .from('orders_with_details')
        .select('*')
        .or(`order_number.ilike.${searchTerm},customer_name.ilike.${searchTerm},customer_email.ilike.${searchTerm},sales_agent.ilike.${searchTerm},customer_phone.ilike.${searchTerm}`)
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);
      return data as Order[];
    },
    enabled: !!query,
  });

  if (isLoading) return <div className="flex h-screen items-center justify-center"><Spinner /></div>;

  return (
    <div className="space-y-6 min-h-screen pb-10">
      {/* HEADER */}
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <Search className="w-8 h-8 text-brand-orange" />
          Search Results
        </h1>
        <p className="text-slate-300 mt-2">
          Found <span className="text-white font-bold">{results.length}</span> results for "<span className="text-brand-orange">{query}</span>"
        </p>
      </div>

      {/* RESULTS LIST */}
      <div className="space-y-3">
        {results.length === 0 ? (
          <EmptyState
            title="No Results Found"
            description={`We couldn't find any orders matching your search for "${query}". Try checking for typos or using a different keyword.`}
          />
        ) : (
          results.map((order) => (
            <Link to={`/order/${order.orderNumber}`} key={order.id} className="block group">
              <div className="relative bg-slate-900/60 backdrop-blur-sm border border-slate-700/50 rounded-xl p-4 hover:bg-slate-800 hover:border-brand-orange/40 transition-all duration-200 group-hover:shadow-lg group-hover:-translate-y-0.5">
                
                {/* Urgent Indicator */}
                {order.isUrgent && (
                  <div className="absolute left-0 top-3 bottom-3 w-1 bg-red-500 rounded-r-full shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                )}

                <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between pl-2">
                  
                  {/* LEFT: Customer Info */}
                  <div className="flex items-center gap-4">
                    {/* THEME ALIGNMENT: Solid Bright Avatar */}
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-xl font-bold shadow-md ${
                      order.isUrgent ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
                    }`}>
                      {order.customerName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        {/* THEME ALIGNMENT: Brighter Text */}
                        <span className="text-white font-bold text-lg group-hover:text-brand-orange transition-colors">
                          {order.customerName}
                        </span>
                        {order.isUrgent && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white shadow-sm">
                            URGENT
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-slate-300 mt-1">
                         {/* THEME ALIGNMENT: No '#' and Brighter Text */}
                        <span className="font-mono font-medium text-slate-200">{order.orderNumber}</span>
                        <span className="w-1 h-1 rounded-full bg-slate-500" />
                        <span className="text-slate-400">{order.patchesType || 'Custom Patch'}</span>
                        {order.salesAgent && (
                              <>
                                <span className="w-1 h-1 rounded-full bg-slate-500" />
                                <span className="text-slate-400">{order.salesAgent}</span>
                              </>
                            )}
                      </div>
                    </div>
                  </div>

                  {/* RIGHT: Stats & Status */}
                  <div className="flex items-center justify-between md:justify-end gap-6 md:gap-10 mt-2 md:mt-0 border-t md:border-t-0 border-white/5 pt-3 md:pt-0">
                    
                    <div className="flex flex-col items-end min-w-[110px]">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1">Status</span>
                      <StatusBadge status={order.status as OrderStatus} />
                    </div>

                    <div className="flex flex-col items-end min-w-[90px]">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1">Amount</span>
                      {canViewFinancials ? (
                        <span className="text-white font-bold text-base tracking-tight">${order.orderAmount.toLocaleString()}</span>
                      ) : (
                        <div className="flex items-center gap-1 text-slate-500">
                          <Lock className="w-3 h-3" />
                          <span className="text-xs">Hidden</span>
                        </div>
                      )}
                    </div>

                    <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-brand-orange group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
};

export default SearchResultsPage;