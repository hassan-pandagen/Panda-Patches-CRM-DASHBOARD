import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import Sidebar from "./Sidebar";
import Header from "./Header";

const AppLayout: React.FC = () => {
  const location = useLocation();

  return (
    <div className="flex h-screen bg-[#0B1120] text-slate-200 overflow-hidden relative selection:bg-brand-orange/30">
      {/* --- LAYER 1: AMBIENT BACKGROUND (CSS animations - no JS repaints) --- */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        {/* Top Left - Warm Glow */}
        <div className="absolute -top-[20%] -left-[10%] w-[800px] h-[800px] bg-brand-orange/20 rounded-full blur-[120px] opacity-40" />

        {/* Bottom Right - Cool Glow */}
        <div className="absolute -bottom-[20%] -right-[10%] w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-[120px] opacity-35" />

        {/* Center - Subtle Fill */}
        <div className="absolute top-[20%] left-[30%] w-[600px] h-[600px] bg-purple-500/5 rounded-full blur-[150px]" />
      </div>

      {/* --- LAYER 2: FILM GRAIN (THE MAGIC SAUCE) --- */}
      {/* This invisible noise texture makes the glass look expensive */}
      <div
        className="fixed inset-0 z-[1] opacity-[0.03] pointer-events-none mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* --- LAYER 3: CONTENT --- */}
      {/* Sidebar (Elevated) */}
      <div className="relative z-20 flex-shrink-0 shadow-2xl shadow-black/50">
        <Sidebar />
      </div>

      {/* Main Area */}
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="relative z-20 flex-1 overflow-y-auto p-6 lg:p-8 custom-scrollbar scroll-smooth">
          {/* Smooth page transitions - fade in/out between routes */}
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Outlet />
          </motion.div>

          {/* Floating Footer Credit (Optional but nice) */}
          <div className="py-6 text-center text-xs text-slate-600 font-medium tracking-widest uppercase opacity-50 hover:opacity-100 transition-opacity">
            Panda Patches OS v2.5
          </div>
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
