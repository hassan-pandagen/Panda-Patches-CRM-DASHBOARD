import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../services/supabaseClient';
import { useCustomerAuth } from '../../contexts/CustomerAuthContext';
import { useNavigate } from 'react-router-dom';
import { Bell, Package, Truck, MapPin, CheckCircle } from 'lucide-react';

interface CustomerNotification {
  id: number;
  customer_email: string;
  order_id: number | null;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
  orders?: { order_number: string } | null;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  status_change: <Package className="w-4 h-4 text-blue-400" />,
  shipped: <Truck className="w-4 h-4 text-orange-400" />,
  delivered: <MapPin className="w-4 h-4 text-emerald-400" />,
  proof_ready: <CheckCircle className="w-4 h-4 text-yellow-400" />,
};

const CustomerNotificationBell: React.FC = () => {
  const { profile } = useCustomerAuth();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ['customer-notifications', profile?.email],
    queryFn: async () => {
      if (!profile?.email) return [];
      const { data, error } = await supabase
        .from('customer_notifications')
        .select('*, orders(order_number)')
        .eq('customer_email', profile.email)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as CustomerNotification[];
    },
    enabled: !!profile?.email,
    refetchInterval: 30000, // Poll every 30s
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!profile?.email) return;
      await supabase
        .from('customer_notifications')
        .update({ is_read: true })
        .eq('customer_email', profile.email)
        .eq('is_read', false);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-notifications'] });
    },
  });

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Subscribe to realtime notifications
  useEffect(() => {
    if (!profile?.email) return;

    const channel = supabase
      .channel('customer-notifications-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'customer_notifications',
        filter: `customer_email=eq.${profile.email}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['customer-notifications'] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.email, queryClient]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-brand-orange text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <h3 className="text-sm font-semibold text-white">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="text-xs text-brand-orange hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-slate-500 text-sm">
                No notifications yet
              </div>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (n.orders?.order_number) {
                      navigate(`/customer/order/${n.orders.order_number}`);
                    }
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-4 py-3 hover:bg-white/5 transition-all border-b border-white/5 ${
                    !n.is_read ? 'bg-brand-orange/5' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{ICON_MAP[n.type] || ICON_MAP.status_change}</div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!n.is_read ? 'font-semibold text-white' : 'text-slate-300'}`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{n.body}</p>
                      <p className="text-xs text-slate-600 mt-1">
                        {new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    {!n.is_read && <div className="w-2 h-2 bg-brand-orange rounded-full mt-1.5 shrink-0" />}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerNotificationBell;
