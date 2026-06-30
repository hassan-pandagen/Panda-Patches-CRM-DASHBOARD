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
  DollarSign,
  Bell,
  Inbox,
  CreditCard,
  Building2,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useQueryPrefetch } from "../../hooks/useQueryPrefetch";
import { BrandLogo } from "../ui/BrandLogo";

interface SidebarItemProps {
  to: string;
  label: string;
  icon: React.ReactNode;
  prefetchType?: "orders" | "dashboard" | "reports" | "clock-in-out" | "none";
  onClick?: () => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({
  to,
  label,
  icon,
  prefetchType = "none",
  onClick,
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
      onClick={onClick}
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

interface SidebarProps {
  onNavigate?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onNavigate }) => {
  const { role, signOut, permissions } = useAuth();

  const isAdmin = role === "ADMIN";
  const canViewFinancials = isAdmin || permissions?.reports_view_financials;
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
    {
      to: "/activity",
      label: "Activity",
      icon: <Bell className="w-5 h-5" />,
      prefetchType: "none" as const,
    },
    {
      to: "/inbox",
      label: "Inbox",
      icon: <Inbox className="w-5 h-5" />,
      prefetchType: "none" as const,
    },
  ];

  return (
    <aside className="w-64 flex flex-col h-full bg-[#0B1120]/80 backdrop-blur-xl border-r border-white/5 relative">
      <div className="absolute right-0 top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-white/20 to-transparent" />

      {/* Logo Header */}
      <div className="flex items-center justify-center h-20 flex-shrink-0 px-4">
        <BrandLogo className="h-9 w-auto" variant="dark" />
      </div>
      <nav className="grow space-y-2 p-4 overflow-y-auto custom-scrollbar">
        {navItems
          .filter((item) => {
            const isProduction = role === "PRODUCTION";
            const isShipping = role === "SHIPPING";
            if (item.to === "/") return canViewFinancials;
            if (item.to === "/orders") return true;
            if (item.to === "/reports")
              return canViewFinancials || canViewProduction;
            if (item.to === "/clock-in-out") return true;
            // Activity + Inbox are sales/admin tools — hide from PRODUCTION and SHIPPING
            if (item.to === "/activity") return !isProduction && !isShipping;
            if (item.to === "/inbox") return !isProduction && !isShipping;
            return true;
          })
          .map((item) => (
            <SidebarItem
              key={item.to}
              {...item}
              prefetchType={item.prefetchType}
              onClick={onNavigate}
            />
          ))}

        {permissions?.orders_create && (
          <SidebarItem
            to="/new-order"
            label="New Order"
            icon={<PlusCircle className="w-5 h-5" />}
            onClick={onNavigate}
          />
        )}

        {permissions?.orders_create && (
          <SidebarItem
            to="/quotes"
            label="Quotes"
            icon={<FileText className="w-5 h-5" />}
            onClick={onNavigate}
          />
        )}

        {permissions?.orders_create && (
          <SidebarItem
            to="/payment-forms"
            label="Payment Forms"
            icon={<CreditCard className="w-5 h-5" />}
            onClick={onNavigate}
          />
        )}

        {isAdmin && (
          <>
            <div className="my-2 border-t border-white/10 mx-2" />
            <SidebarItem
              to="/companies"
              label="Companies"
              icon={<Building2 className="w-5 h-5" />}
              onClick={onNavigate}
            />
            <SidebarItem
              to="/portal-customers"
              label="Customers"
              icon={<Users className="w-5 h-5" />}
              onClick={onNavigate}
            />
            <SidebarItem
              to="/bulk-cost-entry"
              label="Bulk Cost Entry"
              icon={<DollarSign className="w-5 h-5" />}
              onClick={onNavigate}
            />
            <SidebarItem
              to="/user-management"
              label="User Management"
              icon={<Users className="w-5 h-5" />}
              onClick={onNavigate}
            />
            <SidebarItem
              to="/performance-metrics"
              label="Performance Metrics"
              icon={<Activity className="w-5 h-5" />}
              onClick={onNavigate}
            />
            <SidebarItem
              to="/settings"
              label="Settings"
              icon={<Settings className="w-5 h-5" />}
              onClick={onNavigate}
            />
          </>
        )}
      </nav>

      <div className="mt-auto flex-shrink-0 p-4 pt-0">
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
