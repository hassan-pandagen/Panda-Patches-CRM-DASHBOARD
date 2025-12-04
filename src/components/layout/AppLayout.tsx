import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header'; // Import the existing Header component

const AppLayout: React.FC = () => {
  return (
    <div className="flex h-screen bg-slate-950 text-slate-200">
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