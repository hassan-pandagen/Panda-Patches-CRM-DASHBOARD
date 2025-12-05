import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, BarChart3, Settings, Users, LogOut, PlusCircle, Clock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';


interface SidebarItemProps {
  to: string;
  label: string;
  icon: React.ReactNode;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ to, label, icon }) => {
  const location = useLocation();
  const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));

  return (
    <NavLink
      to={to}
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
  const { role, permissions, logout, settings } = useAuth();

  const navItems = [
    { to: '/', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    { to: '/orders', label: 'Orders', icon: <Package className="w-5 h-5" /> },
    { to: '/reports', label: 'Reports', icon: <BarChart3 className="w-5 h-5" /> },
    { to: '/clock-in-out', label: 'Clock In/Out', icon: <Clock className="w-5 h-5" /> },
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

      <nav className="flex-grow space-y-2">
        {navItems.map((item) => (
          <SidebarItem key={item.to} {...item} />
        ))}

        {/* --- ADD NEW ORDER BUTTON (PERMISSION-BASED) --- */}
        {/* Only show if user has 'orders_create' permission */}
        {permissions?.orders_create && (
          <SidebarItem
            to="/new-order"
            label="New Order"
            icon={<PlusCircle className="w-5 h-5" />}
          />
        )}
        {/* --- PERMISSION-BASED NAVIGATION --- */}
        {/* Only show if Admin OR has explicit permission */}
        {(role === 'ADMIN' || permissions?.users_manage) && (
          <SidebarItem
            to="/user-management"
            label="User Management"
            icon={<Users className="w-5 h-5" />}
          />
        )}

        {role === 'ADMIN' && (
          <SidebarItem
            to="/settings"
            label="Settings"
            icon={<Settings className="w-5 h-5" />}
          />
        )}
      </nav>

      <div className="mt-auto">
        <button
          onClick={logout}
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