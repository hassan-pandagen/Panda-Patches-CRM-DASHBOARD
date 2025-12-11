import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, BarChart3, Settings, Users, LogOut, PlusCircle, Clock, Activity } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useQueryPrefetch } from '../../hooks/useQueryPrefetch';

interface SidebarItemProps {
  to: string;
  label: string;
  icon: React.ReactNode;
  prefetchType?: 'orders' | 'dashboard' | 'reports' | 'clock-in-out' | 'none';
}

const SidebarItem: React.FC<SidebarItemProps> = ({ to, label, icon, prefetchType = 'none' }) => {
  const location = useLocation();
  const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
  const { prefetchOrders, prefetchDashboard, prefetchReports, prefetchClockInOut } = useQueryPrefetch();

  const handleMouseEnter = async () => {
    if (prefetchType === 'orders') {
      await prefetchOrders();
    } else if (prefetchType === 'dashboard') {
      await prefetchDashboard();
    } else if (prefetchType === 'reports') {
      await prefetchReports();
    } else if (prefetchType === 'clock-in-out') {
      await prefetchClockInOut();
    }
  };

  return (
    <NavLink
      to={to}
      onMouseEnter={handleMouseEnter}
      onTouchStart={handleMouseEnter}
      className={ `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 relative ${
          isActive
            ? 'bg-brand-orange text-white shadow-lg shadow-brand-orange/20'
            : 'text-slate-300 hover:bg-white/10 hover:text-white'
        }`
      }
    >
      {icon}
      <span>{label}</span>
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 bg-white rounded-r-full" />
      )}
    </NavLink>
  );
};

const Sidebar: React.FC = () => {
  const { role, signOut, settings, permissions } = useAuth();

  const navItems = [
    { to: '/', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" />, prefetchType: 'dashboard' as const },
    { to: '/orders', label: 'Orders', icon: <Package className="w-5 h-5" />, prefetchType: 'orders' as const },
    { to: '/reports', label: 'Reports', icon: <BarChart3 className="w-5 h-5" />, prefetchType: 'reports' as const },
    { to: '/clock-in-out', label: 'Clock In/Out', icon: <Clock className="w-5 h-5" />, prefetchType: 'clock-in-out' as const },
  ];

  return (
    <aside className="w-64 bg-slate-900/70 backdrop-blur-xl border-r border-white/10 p-4 flex flex-col">
      <div className="flex items-center justify-center p-4 mb-4 h-20">
        {settings?.logo_url ? (
          <img src={settings.logo_url} alt="Company Logo" className="max-h-full max-w-full object-contain" />
        ) : (
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Panda Patches Logo" className="h-10 w-10" />
            <h1 className="text-xl font-bold text-white">Panda Patches</h1>
          </div>
        )}
      </div>

      <nav className="grow space-y-2">
        {/* ✅ FIX: Render main items EXACTLY ONCE */}
        {navItems
          .filter(item => {
            if (item.to === '/') return permissions?.orders_create;
            if (item.to === '/reports') return permissions?.reports_view_financials || role === 'ADMIN';
            if (item.to === '/orders') return permissions?.orders_view_all;
            return true;
          })
          .map((item) => (
            <SidebarItem key={item.to} {...item} prefetchType={item.prefetchType} />
          ))}

        {/* --- ADD NEW ORDER BUTTON (PERMISSION-BASED) --- */}
        {permissions?.orders_create && (
          <SidebarItem
            to="/new-order"
            label="New Order"
            icon={<PlusCircle className="w-5 h-5" />}
          />
        )}

        {/* --- ADMIN-ONLY NAVIGATION --- */}
        {role === 'ADMIN' && (
          <>
            <div className="my-2 border-t border-white/10 mx-2" /> {/* Divider */}
            <SidebarItem
              to="/user-management"
              label="User Management"
              icon={<Users className="w-5 h-5" />}
            />
            <SidebarItem
              to="/performance-metrics"
              label="Performance Metrics"
              icon={<Activity className="w-5 h-5" />}
            />
            <SidebarItem
              to="/settings"
              label="Settings"
              icon={<Settings className="w-5 h-5" />}
            />
          </>
        )}
      </nav>

      <div className="mt-auto">
        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-slate-400 hover:bg-red-500/20 hover:text-red-300 transition-all duration-200"
        >
          <LogOut className="w-5 h-5" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;