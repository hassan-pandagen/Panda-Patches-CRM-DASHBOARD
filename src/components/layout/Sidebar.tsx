import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  FileText,
  BarChart3,
  Settings,
  Users,
  LogOut,
  PlusCircle,
  Clock,
  Activity,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useQueryPrefetch } from "../../hooks/useQueryPrefetch";
import { BrandLogo } from "../ui/BrandLogo";

interface SidebarItemProps {
  to: string;
  label: string;
  icon: React.ReactNode;
  prefetchType?: "orders" | "dashboard" | "reports" | "clock-in-out" | "none";
}

const SidebarItem: React.FC<SidebarItemProps> = ({
  to,
  label,
  icon,
  prefetchType = "none",
}) => {
  const location = useLocation();
  const isActive =
    location.pathname === to ||
    (to !== "/" && location.pathname.startsWith(to));
  const {
    prefetchOrders,
    prefetchDashboard,
    prefetchReports,
    prefetchClockInOut,
  } = useQueryPrefetch();

  const handleMouseEnter = async () => {
    if (prefetchType === "orders") await prefetchOrders();
    else if (prefetchType === "dashboard") await prefetchDashboard();
    else if (prefetchType === "reports") await prefetchReports();
    else if (prefetchType === "clock-in-out") await prefetchClockInOut();
  };

  return (
    <NavLink
      to={to}
      onMouseEnter={handleMouseEnter}
      onTouchStart={handleMouseEnter}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 relative ${
        isActive
          ? "bg-brand-orange text-white shadow-lg shadow-brand-orange/20"
          : "text-slate-300 hover:bg-white/10 hover:text-white"
      }`}
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
  const { role, signOut, permissions } = useAuth();

  const isAdmin = role === "ADMIN";

  // Helper: Is this a "Financial" viewer? (Sales Manager)
  const canViewFinancials = isAdmin || permissions?.reports_view_financials;

  // Helper: Is this a "Production" viewer? (Hassan)
  const canViewProduction = isAdmin || permissions?.orders_edit_production;

  const navItems = [
    {
      to: "/",
      label: "Dashboard",
      icon: <LayoutDashboard className="w-5 h-5" />,
      prefetchType: "dashboard" as const,
    },
    {
      to: "/orders",
      label: "Orders",
      icon: <Package className="w-5 h-5" />,
      prefetchType: "orders" as const,
    },
    {
      to: "/reports",
      label: "Reports",
      icon: <BarChart3 className="w-5 h-5" />,
      prefetchType: "reports" as const,
    },
    {
      to: "/clock-in-out",
      label: "Clock In/Out",
      icon: <Clock className="w-5 h-5" />,
      prefetchType: "clock-in-out" as const,
    },
  ];

  return (
    <aside className="w-64 flex flex-col h-full bg-[#0B1120]/80 backdrop-blur-xl border-r border-white/5 relative">
      {/* Add a subtle top-to-bottom shine on the right border */}
      <div className="absolute right-0 top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-white/20 to-transparent" />

      {/* Logo Header */}
      <div className="flex items-center justify-center h-20 flex-shrink-0 px-4">
        <BrandLogo className="h-9 w-auto" variant="dark" />
      </div>
      <nav className="grow space-y-2 p-4">
        {navItems
          .filter((item) => {
            // 1. Dashboard: Only Admin or Financial Viewers (Hides for Production)
            if (item.to === "/") return canViewFinancials;

            // 2. Orders: Everyone
            if (item.to === "/orders") return true;

            // 3. Reports: Show if they can view Financials OR Production stats
            if (item.to === "/reports")
              return canViewFinancials || canViewProduction;

            // 4. Clock In/Out: Everyone
            if (item.to === "/clock-in-out") return true;

            return true;
          })
          .map((item) => (
            <SidebarItem
              key={item.to}
              {...item}
              prefetchType={item.prefetchType}
            />
          ))}

        {/* New Order: Permission Based */}
        {permissions?.orders_create && (
          <SidebarItem
            to="/new-order"
            label="New Order"
            icon={<PlusCircle className="w-5 h-5" />}
          />
        )}

        {/* Quotes: Permission Based */}
        {permissions?.orders_create && (
          <SidebarItem
            to="/quotes"
            label="Quotes"
            icon={<FileText className="w-5 h-5" />}
          />
        )}

        {/* ADMIN ONLY LINKS */}
        {isAdmin && (
          <>
            <div className="my-2 border-t border-white/10 mx-2" />
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
