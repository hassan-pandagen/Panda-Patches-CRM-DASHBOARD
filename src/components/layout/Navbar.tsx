import React from "react";
import { NavLink } from "react-router-dom";
import { DashboardIcon, PlusIcon, SettingsIcon } from "../ui/Icons";
import { useAuth } from "../../contexts/AuthContext";
import { UserRole } from "../../types";

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
}

const NavItem: React.FC<NavItemProps> = ({ to, icon, label }) => (
  <NavLink
    to={to}
    aria-label={label}
    className={({ isActive }) =>
      `flex flex-col items-center justify-center p-3 rounded-xl transition-all duration-200 ${
        isActive
          ? "text-white bg-slate-700/70 shadow-md shadow-black/30"
          : "text-slate-400 hover:text-white hover:bg-slate-800/60"
      }`
    }
  >
    <span className="w-6 h-6 flex items-center justify-center">{icon}</span>
  </NavLink>
);

const Navbar: React.FC = () => {
  const { role } = useAuth();

  return (
    <nav
      className="
        md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 
        bg-slate-900/90 backdrop-blur-md
        border border-slate-700/40 rounded-2xl 
        px-8 py-3 flex items-center justify-between w-[92%]
        shadow-lg shadow-black/30 z-50
      "
    >
      <div className="flex justify-around items-center w-full gap-6">
        {/* Common Links */}
        {role === UserRole.PRODUCTION || role === UserRole.AGENT ? ( // Added UserRole.AGENT here
          <NavItem to="/reports" icon={<DashboardIcon />} label="Reports" />
        ) : (
          <NavItem to="/" icon={<DashboardIcon />} label="Dashboard" />
        )}
        
        {role !== UserRole.PRODUCTION && role !== UserRole.AGENT && <NavItem to="/new-order" icon={<PlusIcon />} label="New Order" />} {/* Added UserRole.AGENT here */}

        {/* Admin-only */}
        {role === "ADMIN" && (
          <NavItem to="/settings" icon={<SettingsIcon />} label="Settings" />
        )}
      </div>
    </nav>
  );
};

export default Navbar;
