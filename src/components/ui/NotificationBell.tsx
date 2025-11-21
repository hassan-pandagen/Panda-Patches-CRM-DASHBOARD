import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Bell, AlertCircle, Clock, Check, CheckCircle2 } from "lucide-react";
import { supabase } from "../../services/supabaseClient";

interface Notification {
  id: string;
  orderNumber: string;
  customerName: string;
  type: 'URGENT' | 'REVISION';
  message: React.ReactNode;
  timestamp: string;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  // State to track IDs of notifications the user has "dismissed"
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('dismissed_notifications');
    return saved ? JSON.parse(saved) : [];
  });
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Helper to save dismissed IDs
  const markAsRead = (id: string) => {
    const newDismissed = [...dismissedIds, id];
    setDismissedIds(newDismissed);
    localStorage.setItem('dismissed_notifications', JSON.stringify(newDismissed));
  };

  const markAllRead = () => {
    const allIds = notifications.map(n => n.id);
    const combined = [...new Set([...dismissedIds, ...allIds])]; // Unique IDs
    setDismissedIds(combined);
    localStorage.setItem('dismissed_notifications', JSON.stringify(combined));
  };

  // Fetch initial state
  const fetchNotifications = async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("order_number, customer_name, created_at, is_urgent, is_urgent_approved, status")
      .or('and(is_urgent.eq.true,is_urgent_approved.eq.false),status.eq.REVISION_REQUESTED')
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error fetching notifications:", error);
      return [];
    }

    return (data || []).map((order: any) => ({
      // Use composite ID to handle cases where an order might have both issues over time
      id: `${order.order_number}-${order.status}`, 
      orderNumber: order.order_number,
      customerName: order.customer_name,
      timestamp: order.created_at,
      type: order.status === 'REVISION_REQUESTED' ? 'REVISION' : 'URGENT',
      message: order.status === 'REVISION_REQUESTED' 
        ? <span>Revision requested for <strong>{order.order_number}</strong></span>
        : <span>Urgent approval needed for <strong>{order.order_number}</strong></span>
    }));
  };

  useEffect(() => {
    let isMounted = true;

    const loadInitial = async () => {
      const initial = await fetchNotifications();
      if (isMounted) setNotifications(initial);
    };
    loadInitial();

    // Realtime Listener
    const channel = supabase
      .channel("global_notifications")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          loadInitial();
        }
      )
      .subscribe();

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      isMounted = false;
      document.removeEventListener("mousedown", handleClickOutside);
      supabase.removeChannel(channel);
    };
  }, []);

  // Filter out the dismissed ones for display
  const activeNotifications = notifications.filter(n => !dismissedIds.includes(n.id));

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className={`relative p-2 rounded-xl transition-all duration-200 ${
            open ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'
        }`}
      >
        <Bell className="w-5 h-5" />
        {activeNotifications.length > 0 && (
          <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 bg-red-500 rounded-full ring-2 ring-slate-900 animate-pulse"></span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-80 sm:w-96 origin-top-right bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden ring-1 ring-black/5">
          <div className="px-4 py-3 border-b border-white/5 flex justify-between items-center bg-slate-900">
            <div className="flex items-center gap-2">
                <h3 className="font-semibold text-white text-sm">Notifications</h3>
                {activeNotifications.length > 0 && (
                    <span className="text-[10px] bg-brand-orange/20 text-brand-orange px-2 py-0.5 rounded-full font-bold">
                        {activeNotifications.length} NEW
                    </span>
                )}
            </div>
            {activeNotifications.length > 0 && (
                <button 
                    onClick={markAllRead}
                    className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
                >
                    <CheckCircle2 className="w-3 h-3" /> Mark all read
                </button>
            )}
          </div>
          
          <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
            {activeNotifications.length === 0 ? (
              <div className="py-10 px-4 text-center text-slate-500">
                <Bell className="w-8 h-8 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium text-slate-400">All caught up!</p>
                <p className="text-xs text-slate-500 mt-1">No new alerts to attend to.</p>
              </div>
            ) : (
              <ul className="divide-y divide-white/5">
                {activeNotifications.map((n) => (
                  <li key={n.id} className="relative group bg-transparent hover:bg-white/5 transition-colors">
                    <div className="flex items-start pr-10"> {/* Padding right for the dismiss button */}
                        <Link 
                            to={`/order/${n.orderNumber}`} 
                            onClick={() => setOpen(false)}
                            className="flex-1 p-4 block"
                        >
                            <div className="flex items-start gap-3">
                                <div className={`mt-0.5 p-1.5 rounded-full shrink-0 ${n.type === 'URGENT' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                {n.type === 'URGENT' ? <AlertCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                                </div>
                                <div>
                                    <p className="text-sm text-slate-200 leading-snug mb-1">
                                        {n.message}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        {new Date(n.timestamp).toLocaleDateString()} • {n.customerName}
                                    </p>
                                </div>
                            </div>
                        </Link>

                        {/* MARK AS READ BUTTON */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                markAsRead(n.id);
                            }}
                            className="absolute top-4 right-4 p-1.5 text-slate-500 hover:text-green-400 hover:bg-green-400/10 rounded-full transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                            title="Mark as read"
                        >
                            <Check className="w-4 h-4" />
                        </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}