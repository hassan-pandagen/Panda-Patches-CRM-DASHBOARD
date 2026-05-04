// Bell icon in CRM header — shows unread count + dropdown of last 5 unread.
// Clicking bell or "View all" → /activity page.
import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import {
  Bell, MessageSquare, CheckCircle, Truck, Package,
  AlertCircle, AtSign,
} from 'lucide-react';

const ActivityBell: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fetch unread notifications (max 5 for the dropdown)
  const { data: unread = [] } = useQuery({
    queryKey: ['activity-notifications-unread', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('activity_notifications')
        .select('*')
        .eq('recipient_id', user.id)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['activity-notifications-count', user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const { count, error } = await supabase
        .from('activity_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .eq('is_read', false);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markRead = useMutation({
    mutationFn: async (ids: number[]) => {
      if (!ids.length) return;
      await supabase
        .from('activity_notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .in('id', ids);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity-notifications-unread'] });
      queryClient.invalidateQueries({ queryKey: ['activity-notifications-count'] });
      queryClient.invalidateQueries({ queryKey: ['activity-notifications'] });
    },
  });

  const handleNotifClick = (n: any) => {
    setOpen(false);
    markRead.mutate([n.id]);
    if (n.link) navigate(n.link);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        aria-label="Activity"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 bg-brand-orange text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-slate-800/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Notifications</h3>
            {unreadCount > 0 && (
              <span className="text-xs text-slate-400">{unreadCount} unread</span>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {unread.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell className="w-8 h-8 text-slate-700 mx-auto mb-2 opacity-50" />
                <p className="text-xs text-slate-500">You're all caught up!</p>
              </div>
            ) : (
              unread.map(n => {
                const Icon = iconForType(n.type);
                const colors = colorForType(n.type);
                return (
                  <button
                    key={n.id}
                    onClick={() => handleNotifClick(n)}
                    className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-b-0"
                  >
                    <div className={`p-1.5 rounded-md shrink-0 ${colors.bg}`}>
                      <Icon className={`w-3.5 h-3.5 ${colors.text}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate">{n.title}</p>
                      {n.body && (
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{n.body}</p>
                      )}
                      <p className="text-[10px] text-slate-500 mt-1">{relativeTime(n.created_at)}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <Link
            to="/activity"
            onClick={() => setOpen(false)}
            className="block text-center py-3 text-sm text-brand-orange font-medium hover:bg-brand-orange/10 transition-colors border-t border-white/10"
          >
            View all activity
          </Link>
        </div>
      )}
    </div>
  );
};

const iconForType = (type: string) => {
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

const colorForType = (type: string) => {
  switch (type) {
    case 'customer_message': return { bg: 'bg-blue-400/10',     text: 'text-blue-400' };
    case 'order_paid':       return { bg: 'bg-emerald-400/10',  text: 'text-emerald-400' };
    case 'order_shipped':    return { bg: 'bg-purple-400/10',   text: 'text-purple-400' };
    case 'order_delivered':  return { bg: 'bg-emerald-400/10',  text: 'text-emerald-400' };
    case 'order_revision':   return { bg: 'bg-amber-400/10',    text: 'text-amber-400' };
    case 'mockup_approved':  return { bg: 'bg-emerald-400/10',  text: 'text-emerald-400' };
    case 'mention':          return { bg: 'bg-brand-orange/10', text: 'text-brand-orange' };
    default:                 return { bg: 'bg-slate-700/30',    text: 'text-slate-400' };
  }
};

const relativeTime = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export default ActivityBell;
