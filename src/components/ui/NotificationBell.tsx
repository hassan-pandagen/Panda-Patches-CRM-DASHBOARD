import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Bell, Check, CheckCircle2 } from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import { logger } from "../../services/logger";
import { OrderStatus } from "../../types";
import NotificationStatusBadge from "./NotificationStatusBadge";

interface Notification {
    id: string;
    orderId: number;
    orderNumber: string;
    customerName: string;
    type: 'URGENT' | 'REVISION';
    message: React.ReactNode;
    timestamp: string;
}

export default function NotificationBell() {
    const [open, setOpen] = React.useState(false);
    const [notifications, setNotifications] = React.useState<Notification[]>([]);
    // State to track IDs of notifications the user has "dismissed"
    const [dismissedIds, setDismissedIds] = React.useState<string[]>(() => {
        try {
            const saved = localStorage.getItem('dismissed_notifications');
            return saved ? JSON.parse(saved) : [];
        } catch (err) {
            logger.warn('[NotificationBell] Failed to load dismissed notifications', err);
            return [];
        }
    });

    const dropdownRef = React.useRef<HTMLDivElement>(null);

    // Helper to save dismissed IDs with error handling
    const markAsRead = (id: string) => {
        try {
            const newDismissed = [...dismissedIds, id];
            setDismissedIds(newDismissed);
            localStorage.setItem('dismissed_notifications', JSON.stringify(newDismissed));
        } catch (err) {
            logger.error('[NotificationBell] Failed to save dismissed notification', err);
            // Silently fail - notification will reappear on refresh
        }
    };

    const markAllRead = () => {
        try {
            const allIds = notifications.map(n => n.id);
            const combined = [...new Set([...dismissedIds, ...allIds])]; // Unique IDs
            setDismissedIds(combined);
            localStorage.setItem('dismissed_notifications', JSON.stringify(combined));
        } catch (err) {
            logger.error('[NotificationBell] Failed to mark all notifications as read', err);
            // Silently fail - notifications will reappear on refresh
        }
    };

    // Fetch initial state
    const fetchNotifications = async () => {
        // We now fetch from two sources and combine them:
        // 1. Urgent orders needing approval (from `orders` table)
        // 2. Important status changes (from `order_history` table)

        // Complete lifecycle status notifications
        const notifiableStatuses = [
            OrderStatus.NEW_ORDER,
            OrderStatus.REVISION_REQUESTED,
            OrderStatus.APPROVED,
            OrderStatus.IN_PRODUCTION,
            OrderStatus.QUALITY_ASSURANCE,
            OrderStatus.SHIPPED,
            OrderStatus.DELIVERED,
            OrderStatus.CANCELLED,
            OrderStatus.REFUNDED,
        ];

        // Query 1: Status change notifications
        const statusPromise = supabase
            .from('order_history')
            .select('id, order_id, user_email, field_changed, new_value, changed_at, orders(order_number, customer_name)')
            .eq('field_changed', 'status')
            .in('new_value', notifiableStatuses)
            .order('changed_at', { ascending: false })
            .limit(20);

        // Query 2: URGENT_STATUS changes (approvals/rejections)
        const urgentStatusPromise = supabase
            .from('order_history')
            .select('id, order_id, user_email, field_changed, new_value, changed_at, orders(order_number, customer_name)')
            .eq('field_changed', 'URGENT_STATUS')
            .order('changed_at', { ascending: false })
            .limit(20);

        // Query 3: Pending urgent orders needing approval
        const urgentOrdersPromise = supabase
            .from('orders')
            .select('id, order_number, customer_name, created_at, is_urgent, is_urgent_approved')
            .eq('is_urgent', true)
            .eq('is_urgent_approved', false)
            .order('created_at', { ascending: false });

        const [{ data: statusData, error: statusError }, { data: urgentStatusData, error: urgentStatusError }, { data: urgentOrdersData, error: urgentOrdersError }] = await Promise.all([statusPromise, urgentStatusPromise, urgentOrdersPromise]);

        if (statusError) logger.error("[NotificationBell] Error fetching status notifications", statusError);
        if (urgentStatusError) logger.error("[NotificationBell] Error fetching urgent status notifications", urgentStatusError);
        if (urgentOrdersError) logger.error("[NotificationBell] Error fetching urgent orders", urgentOrdersError);

        if (!statusData && !urgentStatusData && !urgentOrdersData) {
            return [];
        }

        // Map status change notifications
        const statusNotifications = (statusData || []).map((item: any) => ({
            id: `status-${item.id}`,
            orderId: item.order_id,
            orderNumber: item.orders.order_number,
            customerName: item.orders.customer_name,
            timestamp: item.changed_at,
            type: item.new_value,
            message: <span><strong>{item.new_value.replace(/_/g, ' ')}</strong> for order <strong>{item.orders.order_number}</strong></span>,
        }));

        // Map urgent status change notifications
        const urgentStatusNotifications = (urgentStatusData || []).map((item: any) => ({
            id: `urgent-status-${item.id}`,
            orderId: item.order_id,
            orderNumber: item.orders.order_number,
            customerName: item.orders.customer_name,
            timestamp: item.changed_at,
            type: 'URGENT',
            message: <span>Urgent request updated for <strong>{item.orders.order_number}</strong>: {item.new_value}</span>,
        }));

        // Map pending urgent orders
        const urgentOrderNotifications = (urgentOrdersData || []).map((order: any) => ({
            id: `urgent-order-${order.id}`,
            orderId: order.id,
            orderNumber: order.order_number,
            customerName: order.customer_name,
            timestamp: order.created_at,
            type: 'URGENT',
            message: <span>⚡ Urgent approval needed for <strong>{order.order_number}</strong></span>,
        }));

        // Combine, sort by date, and return
        return [...statusNotifications, ...urgentStatusNotifications, ...urgentOrderNotifications].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    };

    React.useEffect(() => {
        let isMounted = true;

        const loadInitial = async () => {
            const initial = await fetchNotifications();
            if (isMounted) setNotifications(initial);
        };
        loadInitial();

        // Realtime Listener - Watch both tables for changes
        const channel = supabase
            .channel("global_notifications")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "order_history" },
                () => {
                    loadInitial();
                }
            )
            .on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "orders" },
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
                className={`relative p-2 rounded-xl transition-all duration-200 ${open ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'
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
                                                    <NotificationStatusBadge status={n.type as OrderStatus | 'URGENT'} size="sm" />

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