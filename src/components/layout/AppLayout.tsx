import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

const AppLayout: React.FC = () => (
    <div className="min-h-screen bg-slate-900">
        <Sidebar />
        
        {/* Main Content Area */}
        <div className="lg:pl-64"> {/* Match sidebar width (w-64) */}
            <Header />
            
            {/* Main Content */}
            <main className="py-8 min-h-screen">
                <div className="px-4 sm:px-6 lg:px-8">
                    <Outlet />
                </div>
            </main>
        </div>
    </div>
);

export default AppLayout;
