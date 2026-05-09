// /activity — dedicated notifications inbox for staff (industry-standard pattern).
// Replaces toast spam. Click a notification to navigate to the source + auto-mark-read.
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  Bell,
  MessageSquare,
  Package,
  Truck,
  CheckCircle,
  AlertCircle,
  AtSign,
  Filter,
  Check,
} from 'lucide-react';

interface ActivityNotification {
  id: number;
  recipient_id: string;
  type:
    | 'customer_message'
    | 'order_paid'
    | 'order_shipped'
    | 'order_delivered'
    | 'order_revision'
    | 'mockup_approved'
    | 'mention'
    | 'system';
  title: string;
  body: string | null;
  link: string | null;
  related_order_id: number | null;
  related_message_id: number | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

type FilterTab = 'all' | 'unread' | 'customer_message' | 'order' | 'mention';

const ActivityPage: React.FC = () => {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterTab>('unread');

  // Production users don't need customer-facing notifications — redirect to orders
  useEffect(() => {
    if (role === 'PRODUCTION') navigate('/orders', { replace: true });
  }, [role, navigate]);

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['activity-notifications', user?.id],
    queryFn: async (): Promise<ActivityNotification[]> => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('activity_notifications')
        .select('*')
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  // Filter
  const filtered = notifications.filter(n => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !n.is_read;
    if (filter === 'customer_message') return n.type === 'customer_message';
    if (filter === 'order')
      return ['order_paid', 'order_shipped', 'order_delivered', 'order_revision'].includes(n.type);
    if (filter === 'mention') return n.type === 'mention';
    return true;
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const markRead = useMutation({
    mutationFn: async (ids: number[]) => {
      if (!ids.length) return;
      const { error } = await supabase
        .from('activity_notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity-notifications'] });
    },
  });

  const handleClick = (n: ActivityNotification) => {
    if (!n.is_read) markRead.mutate([n.id]);
    if (n.link) navigate(n.link);
  };

  const handleMarkAllRead = () => {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length) markRead.mutate(unreadIds);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Bell className="w-6 h-6 text-brand-orange" />
            Activity
            {unreadCount > 0 && (
              <span className="text-xs px-2.5 py-1 bg-brand-orange text-white rounded-full">
                {unreadCount} unread
              </span>
            )}
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Customer messages, order updates, and mentions in one place
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="text-sm text-slate-400 hover:text-white flex items-center gap-2 transition-colors"
          >
            <Check className="w-4 h-4" />
            Mark all as read
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 border-b border-white/10 overflow-x-auto">
        {[
          { id: 'unread' as const, label: 'Unread', count: unreadCount },
          { id: 'all' as const, label: 'All', count: notifications.length },
          {
            id: 'customer_message' as const,
            label: 'Customer Messages',
            count: notifications.filter(n => n.type === 'customer_message').length,
          },
          {
            id: 'order' as const,
            label: 'Orders',
            count: notifications.filter(n =>
              ['order_paid', 'order_shipped', 'order_delivered', 'order_revision'].includes(n.type)
            ).length,
          },
          {
            id: 'mention' as const,
            label: 'Mentions',
            count: notifications.filter(n => n.type === 'mention').length,
          },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              filter === tab.id
                ? 'border-brand-orange text-white'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-2 text-xs text-slate-500">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="bg-slate-900/40 border border-white/5 rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16 text-sm text-slate-500">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Bell className="w-12 h-12 text-slate-700 mx-auto mb-3 opacity-50" />
            <p className="text-sm text-slate-400">
              {filter === 'unread' ? 'You\'re all caught up!' : 'No notifications yet.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map(n => (
              <NotificationRow
                key={n.id}
                notification={n}
                onClick={() => handleClick(n)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const NotificationRow: React.FC<{
  notification: ActivityNotification;
  onClick: () => void;
}> = ({ notification: n, onClick }) => {
  const Icon = iconForType(n.type);
  const iconColor = colorForType(n.type);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-white/3 transition-colors ${
        !n.is_read ? 'bg-brand-orange/[0.04]' : ''
      }`}
    >
      <div className={`p-2 rounded-lg shrink-0 ${iconColor.bg}`}>
        <Icon className={`w-4 h-4 ${iconColor.text}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <p className={`text-sm ${!n.is_read ? 'text-white font-semibold' : 'text-slate-300'}`}>
            {n.title}
          </p>
          {!n.is_read && (
            <span className="w-2 h-2 rounded-full bg-brand-orange shrink-0 mt-1.5" />
          )}
        </div>
        {n.body && (
          <p className="text-xs text-slate-400 mt-1 line-clamp-2">{n.body}</p>
        )}
        <p className="text-[11px] text-slate-500 mt-1.5">{formatTime(n.created_at)}</p>
      </div>
    </button>
  );
};

const iconForType = (type: ActivityNotification['type']) => {
  switch (type) {
    case 'customer_message': return MessageSquare;
    case 'order_paid':       return CheckCircle;
    case 'order_shipped':    return Truck;
    case 'order_delivered':  return Package;
    case 'order_revision':   return AlertCircle;
    case 'mockup_approved':  return CheckCircle;
    case 'mention':          return AtSign;
    default:                 return Bell;
  }
};

const colorForType = (type: ActivityNotification['type']) => {
  switch (type) {
    case 'customer_message': return { bg: 'bg-blue-400/10',    text: 'text-blue-400' };
    case 'order_paid':       return { bg: 'bg-emerald-400/10', text: 'text-emerald-400' };
    case 'order_shipped':    return { bg: 'bg-purple-400/10',  text: 'text-purple-400' };
    case 'order_delivered':  return { bg: 'bg-emerald-400/10', text: 'text-emerald-400' };
    case 'order_revision':   return { bg: 'bg-amber-400/10',   text: 'text-amber-400' };
    case 'mockup_approved':  return { bg: 'bg-emerald-400/10', text: 'text-emerald-400' };
    case 'mention':          return { bg: 'bg-brand-orange/10', text: 'text-brand-orange' };
    default:                 return { bg: 'bg-slate-700/30',   text: 'text-slate-400' };
  }
};

const formatTime = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default ActivityPage;
