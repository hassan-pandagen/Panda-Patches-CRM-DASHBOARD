import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import Navbar from "./Navbar";
import { useAuth } from "../../contexts/AuthContext";
import { useRealtimeOrders } from "../../hooks/useRealtimeOrders";

/**
 * AppLayout
 * - Global layout wrapper for all authenticated pages
 * - Provides Sidebar (desktop), Navbar (mobile), Header, and main content container
 */
const AppLayout: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  // Subscribe to realtime order updates (active for all authenticated users)
  useRealtimeOrders();

  // ──────────────────────────────────────
  // LOADING STATE
  // ──────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 text-slate-300">
        Loading your dashboard...
      </div>
    );
  }

  // ──────────────────────────────────────
  // UNAUTHENTICATED STATE
  // ──────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 text-red-400 text-center p-6">
        <div>
          <p className="text-xl font-semibold mb-2">You are not authenticated.</p>
          <p className="text-slate-400 text-sm">
            Please <a href="/login" className="text-blue-400 underline">log in</a> to continue.
          </p>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────
  // MAIN LAYOUT (AUTHENTICATED)
  // ──────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 flex flex-col lg:flex-row">
      {/* ───────────── Sidebar (Desktop) ───────────── */}
      <aside className="hidden lg:block fixed left-0 top-0 h-full w-64 bg-slate-800 border-r border-slate-700">
        <Sidebar />
      </aside>

      {/* ───────────── Navbar (Mobile) ───────────── */}
      <div className="lg:hidden fixed bottom-0 left-0 w-full bg-slate-800 border-t border-slate-700 z-50">
        <Navbar />
      </div>

      {/* ───────────── Main Content ───────────── */}
      <div className="flex-1 flex flex-col lg:ml-64 min-h-screen">
        {/* Header */}
        <Header />

        {/* Routed Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-slate-900">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
