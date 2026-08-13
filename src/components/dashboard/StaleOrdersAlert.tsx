// Recurrence-prevention for the order-status backlog: warns when orders are stuck in
// SHIPPED / IN_PRODUCTION past 30 days (standard delivery is 7–14 days, so these are almost
// certainly delivered but never closed). This is the backlog that makes the public /locations
// delivered-count wrong. Links straight to the bulk-close tool. Admin-only (gated by caller).

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { AlertTriangle, ArrowRight } from 'lucide-react';

const StaleOrdersAlert: React.FC = () => {
  const { data: count } = useQuery({
    queryKey: ['stale-orders-count'],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
      const { count, error } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .in('status', ['SHIPPED', 'IN_PRODUCTION'])
        .lt('created_at', cutoff);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 5 * 60 * 1000,
  });

  if (!count || count === 0) return null;

  return (
    <Link to="/bulk-close" className="block group">
      <div className="flex items-center gap-4 p-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition-colors">
        <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400 shrink-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-200">
            {count} order{count === 1 ? '' : 's'} stuck in SHIPPED / IN_PRODUCTION for 30+ days
          </p>
          <p className="text-xs text-amber-300/70">
            Standard delivery is 7–14 days — these are almost certainly delivered but never closed. Close them to keep delivery counts accurate.
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-1 text-amber-300 text-sm font-medium group-hover:gap-2 transition-all shrink-0">
          Bulk close <ArrowRight className="w-4 h-4" />
        </div>
      </div>
    </Link>
  );
};

export default StaleOrdersAlert;
