import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { supabase } from "../../services/supabaseClient";

interface Notification {
  id: string; // Use orderNumber as a unique ID
  message: React.ReactNode;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 🔹 Function to fetch all pending urgent approvals
  const fetchNotifications = async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("orderNumber:order_number, customerName:customer_name")
      .eq("is_urgent", true)
      .eq("is_urgent_approved", false);

    if (error) {
      console.error("Error fetching urgent orders:", error);
      return [];
    }

    return (
      data?.map((order) => ({
        id: order.orderNumber,
        message: (
          <>
            Urgent approval needed for order{" "}
            <strong className="text-blue-400">#{order.orderNumber}</strong> from{" "}
            {order.customerName}.
          </>
        ),
      })) || []
    );
  };

  useEffect(() => {
    let isMounted = true;

    // ✅ Initial fetch
    const loadInitial = async () => {
      const initial = await fetchNotifications();
      if (isMounted) setNotifications(initial);
    };
    loadInitial();

    // ✅ Realtime listener — listens to insert/update
    const channel = supabase
      .channel("urgent_orders_channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        async (payload) => {
          if (!isMounted) return;

          // Check if it’s urgent and not approved
          const newOrder = payload.new as any;
          if (newOrder?.is_urgent && !newOrder?.is_urgent_approved) {
            setNotifications((prev) => {
              const exists = prev.some((n) => n.id === newOrder.order_number);
              if (exists) return prev;
              return [
                {
                  id: newOrder.order_number,
                  message: (
                    <>
                      Urgent approval needed for order{" "}
                      <strong className="text-blue-400">
                        #{newOrder.order_number}
                      </strong>{" "}
                      from {newOrder.customer_name}.
                    </>
                  ),
                },
                ...prev,
              ];
            });
          } else {
            // If order was approved/denied, remove it from notifications
            setNotifications((prev) =>
              prev.filter((n) => n.id !== newOrder.order_number)
            );
          }
        }
      )
      .subscribe();

    // ✅ Close dropdown on outside click
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);

    // Cleanup
    return () => {
      isMounted = false;
      document.removeEventListener("mousedown", handleClickOutside);
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-full hover:bg-slate-800 focus:outline-none"
      >
        <Bell className="w-6 h-6 text-slate-300" />
        {notifications.length > 0 && (
          <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full"></span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-slate-800 border border-slate-700 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="p-3 border-b border-slate-700 font-semibold text-slate-200">
            Notifications
          </div>
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-slate-400 text-sm">
              No new notifications
            </div>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {notifications.map((n) => (
                <Link to={`/order/${n.id}`} key={n.id} onClick={() => setOpen(false)}>
                  <li
                    className="px-4 py-2 text-slate-300 text-sm hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 last:border-b-0"
                  >
                    {n.message}
                  </li>
                </Link>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}