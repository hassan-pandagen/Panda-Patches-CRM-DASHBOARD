import React, { useState, useCallback } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import Sidebar from "./Sidebar";
import Header from "./Header";
import Navbar from "./Navbar";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";

const AppLayout: React.FC = () => {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useKeyboardShortcuts();

  const toggleSidebar = useCallback(() => setSidebarOpen((prev) => !prev), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="flex h-screen bg-[#0B1120] text-slate-200 overflow-hidden relative selection:bg-brand-orange/30">
      {/* --- LAYER 1: AMBIENT BACKGROUND --- */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[800px] h-[800px] bg-brand-orange/20 rounded-full blur-[120px] opacity-40" />
        <div className="absolute -bottom-[20%] -right-[10%] w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-[120px] opacity-35" />
        <div className="absolute top-[20%] left-[30%] w-[600px] h-[600px] bg-purple-500/5 rounded-full blur-[150px]" />
      </div>

      {/* --- LAYER 2: FILM GRAIN --- */}
      <div
        className="fixed inset-0 z-[1] opacity-[0.03] pointer-events-none mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* --- LAYER 3: CONTENT --- */}

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar - hidden on mobile, slide-in drawer when open */}
      <div
        className={`
          fixed inset-y-0 left-0 z-40 w-64 transform transition-transform duration-300 ease-in-out
          md:relative md:translate-x-0 md:z-20 md:flex-shrink-0 md:shadow-2xl md:shadow-black/50
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <Sidebar onNavigate={closeSidebar} />
      </div>

      {/* Main Area */}
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden w-full">
        <Header onMenuToggle={toggleSidebar} />
        <main className="relative z-20 flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 pb-24 md:pb-6 custom-scrollbar scroll-smooth">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Outlet />
          </motion.div>

          <div className="py-6 text-center text-xs text-slate-600 font-medium tracking-widest uppercase opacity-50 hover:opacity-100 transition-opacity">
            Panda Patches OS v2.5
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navbar */}
      <Navbar />
    </div>
  );
};

export default AppLayout;
