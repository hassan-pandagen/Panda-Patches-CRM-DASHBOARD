import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header'; // Import the existing Header component

const AppLayout: React.FC = () => {
  return (
    <div className="relative flex h-screen bg-slate-950 text-white overflow-hidden">
      {/* ANIMATED GRADIENT BACKGROUND BLOBS - Now global */}
      <div className="absolute -top-20 -left-20 w-[400px] h-[400px] bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-full blur-3xl animate-blob" />
      <div className="absolute top-40 -right-20 w-[500px] h-[500px] bg-gradient-to-br from-purple-500/15 to-pink-500/15 rounded-full blur-3xl animate-blob animation-delay-2000" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[450px] h-[450px] bg-gradient-to-br from-brand-orange/10 to-yellow-500/10 rounded-full blur-3xl animate-blob animation-delay-4000" />

      <Sidebar />
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="relative z-20 flex-1 overflow-y-auto p-6 lg:p-8">
          {/* The Outlet will render the specific page component (e.g., Dashboard) */}
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;