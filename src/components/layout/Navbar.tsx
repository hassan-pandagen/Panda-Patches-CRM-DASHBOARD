import React from 'react';
import { NavLink } from 'react-router-dom';
import { DashboardIcon, PlusIcon, SettingsIcon } from '../ui/Icons';

const NavItem: React.FC<{ to: string; icon: React.ReactNode; label: string }> = ({ to, icon, label }) => {
  const baseClasses = "flex flex-col items-center justify-center transition-all duration-200 ease-in-out p-2 rounded-xl";
  const activeClasses = "text-[#BC13FE] bg-[#BC13FE]/10";
  const inactiveClasses = "text-gray-400 hover:text-[#d8b4fe]";

  return (
    <NavLink
      to={to}
      className={({ isActive }) => `${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}
    >
      <span className="w-6 h-6">{icon}</span>
    </NavLink>
  );
};

const Navbar: React.FC = () => {
  return (
    <nav className="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/70 border border-slate-700/60 backdrop-blur-md rounded-2xl px-6 py-3 flex items-center justify-between w-[90%] shadow-[0_0_25px_rgba(188,19,254,0.1)]">
      <div className="flex justify-around items-center w-full gap-4">
        <NavItem 
          to="/" 
          icon={<DashboardIcon />}
          label="Dashboard" 
        />
        <NavItem 
          to="/new-order" 
          icon={<PlusIcon />}
          label="New Order" 
        />
        <NavItem 
          to="/settings" 
          icon={<SettingsIcon />}
          label="Settings" 
        />
      </div>
    </nav>
  );
};

export default Navbar;