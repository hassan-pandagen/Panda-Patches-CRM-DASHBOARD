import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { UserRole } from '../../types/index';
import { DashboardIcon, ChartBarIcon, UserGroupIcon, PlusIcon, MailIcon, SettingsIcon, OrdersIcon } from '../ui/Icons';

// Define icons outside the component to prevent them from being recreated on every render.
// This is crucial for React.memo to work effectively on NavItem.
const dashboardIcon = <DashboardIcon />;
const ordersIcon = <OrdersIcon />;
const chartBarIcon = <ChartBarIcon />;
const userGroupIcon = <UserGroupIcon />;
const plusIcon = <PlusIcon />;
const mailIcon = <MailIcon />;
const settingsIcon = <SettingsIcon />;

// Using React.ReactNode is a flexible way to type the icon prop, accepting components, elements, or other renderable types.
const NavItem: React.FC<{ to: string; icon: React.ReactNode; label: string }> = React.memo(({ to, icon, label }) => {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 
        ${isActive 
          ? 'bg-blue-500/10 text-slate-50 border border-blue-500/20 shadow-lg shadow-black/20' 
          : 'text-slate-400 hover:text-slate-50 hover:bg-slate-800'}`
    }
    >
      {({ isActive }) => (
        <>
          <span className={`w-5 h-5 flex items-center justify-center flex-shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-500'}`}>
            {icon}
          </span>
          <span className="font-medium text-sm">{label}</span>
        </>
      )}
    </NavLink>
  );
});

const Sidebar: React.FC = () => {
  const { user } = useAuth();

  return (
    <aside className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-64 lg:flex-col bg-slate-900/80 backdrop-blur-sm border-r border-slate-800">
      {/* Logo / Brand */}
      <div className="flex h-16 shrink-0 items-center gap-3 px-4 border-b border-slate-800">
        <span className="text-2xl">🐼</span>
        <span className="text-lg font-semibold text-white">Panda Patches</span>
      </div>

      {/* Navigation */}
      <div className="flex flex-col flex-1 overflow-y-auto p-4">
        <nav className="flex flex-col space-y-1.5">
          <NavItem 
            to="/"
            icon={dashboardIcon} 
            label={user?.role === UserRole.ADMIN ? "CEO Dashboard" : "Dashboard"}
          />
          <NavItem 
            to="/orders"
            icon={ordersIcon} 
            label="All Orders"
          />
          {/* --- PROTECTED LINK --- */}
          {/* The Reports link is now only visible to ADMIN users. */}
          {user?.role === UserRole.ADMIN && (
            <>
              <NavItem 
                to="/reports" 
                icon={chartBarIcon} 
                label="Reports" 
              />
              <NavItem 
                to="/users" 
                icon={userGroupIcon} 
                label="Users" 
              />
            </>
          )}

          <NavItem 
            to="/new-order"
            icon={plusIcon}
            label="New Order" 
          />
          <NavItem 
            to="/email-templates"
            icon={mailIcon}
            label="Email Templates" 
          />
          <NavItem 
            to="/settings"
            icon={settingsIcon}
            label="Settings" 
          />
        </nav>
      </div>
    </aside>
  );
};

export default Sidebar;
