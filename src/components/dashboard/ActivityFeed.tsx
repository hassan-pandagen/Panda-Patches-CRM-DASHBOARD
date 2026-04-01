import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { ArrowRight, Clock, User, Package, Zap, CheckCircle, Truck, AlertCircle } from 'lucide-react';
import Skeleton from '../ui/Skeleton';

interface ActivityItem {
  id: string;
  order_id: string;
  order_number: string;
  user_email: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  'NEW_ORDER': <Package className="w-4 h-4 text-blue-400" />,
  'AWAITING_APPROVAL': <AlertCircle className="w-4 h-4 text-yellow-400" />,
  'IN_PRODUCTION': <Zap className="w-4 h-4 text-purple-400" />,
  'SHIPPED': <Truck className="w-4 h-4 text-cyan-400" />,
  'DELIVERED': <CheckCircle className="w-4 h-4 text-green-400" />,
  'COMPLETED': <CheckCircle className="w-4 h-4 text-green-400" />,
};

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getActivityDescription(item: ActivityItem): string {
  const user = item.user_email?.split('@')[0] || 'System';

  if (item.field_changed === 'status') {
    const status = (item.new_value || '').replace(/_/g, ' ').toLowerCase();
    return `${user} moved to ${status}`;
  }
  if (item.field_changed === 'sales_agent') {
    const agent = (item.new_value || '').split('@')[0];
    return `${user} assigned to ${agent}`;
  }
  if (item.field_changed === 'amount_paid') {
    return `${user} recorded payment`;
  }
  if (item.field_changed === 'is_urgent') {
    return item.new_value === 'true' ? `${user} marked as urgent` : `${user} removed urgent`;
  }
  return `${user} updated ${item.field_changed?.replace(/_/g, ' ')}`;
}

const ActivityFeed: React.FC = () => {
  const navigate = useNavigate();

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['activity-feed'],
    queryFn: async () => {
      // Join order_history with orders to get order_number
      const { data, error } = await supabase
        .from('order_history')
        .select('id, order_id, user_email, field_changed, old_value, new_value, changed_at, orders!inner(order_number)')
        .order('changed_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data || []).map((item: any) => ({
        ...item,
        order_number: item.orders?.order_number || 'Unknown',
      })) as ActivityItem[];
    },
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 60,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 p-3">
            <Skeleton variant="circular" width={32} height={32} />
            <div className="flex-1">
              <Skeleton width="80%" height={14} className="mb-2" />
              <Skeleton width="50%" height={12} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500">
        <Clock className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">No recent activity</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1 max-h-[300px] overflow-y-auto custom-scrollbar">
      {activities.map((item) => (
        <button
          key={item.id}
          onClick={() => navigate(`/order/${item.order_number}`)}
          className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors text-left group"
        >
          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
            {item.field_changed === 'status' ? (STATUS_ICONS[item.new_value || ''] || <ArrowRight className="w-4 h-4 text-slate-400" />) :
             item.field_changed === 'sales_agent' ? <User className="w-4 h-4 text-blue-400" /> :
             <ArrowRight className="w-4 h-4 text-slate-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-200 group-hover:text-white transition-colors truncate">
              <span className="font-mono text-brand-orange text-xs mr-1.5">{item.order_number}</span>
              {getActivityDescription(item)}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{formatTimeAgo(item.changed_at)}</p>
          </div>
        </button>
      ))}
    </div>
  );
};

export default ActivityFeed;
