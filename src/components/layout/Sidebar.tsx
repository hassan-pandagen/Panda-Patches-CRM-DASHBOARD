// src/components/layout/Sidebar.tsx

import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Package, BarChart3, Settings, Users, PlusCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { UserRole } from '../../types';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { 
    to: '/new-order', 
    label: 'New Order', 
    icon: PlusCircle 
  },
  { to: '/orders', label: 'Orders', icon: Package },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { 
    to: '/user-management', 
    label: 'User Management', 
    icon: Users,
    roles: [UserRole.ADMIN] // Only visible to Admins
  },
  { 
    to: '/settings', 
    label: 'Settings', 
    icon: Settings,
    roles: [UserRole.ADMIN] // Only visible to Admins
  },
];

const Sidebar: React.FC = () => {
  const { role } = useAuth();

  // Fetch the dynamic logo URL from the database
  const { data: logoUrl } = useQuery({
    queryKey: ['company_logo'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('id', 'company_logo')
        .maybeSingle(); // <-- Use maybeSingle() to prevent 406 error
      
      // If there's a real error (other than just not finding a row), log it.
      if (error) {
        console.error('Error fetching logo:', error);
        return null; // Return null on any error
      }

      // Return the logo URL if data exists, otherwise return null.
      return data?.value || null;
    },
    staleTime: 1000 * 60 * 60, // Cache the logo URL for 1 hour
  });

  const getNavLinkClass = ({ isActive }: { isActive: boolean }) => {
    const baseClasses = "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors";
    if (isActive) {
      return `${baseClasses} bg-brand-orange text-white shadow-lg shadow-brand-orange/30`;
    }
    return `${baseClasses} text-slate-400 hover:bg-white/10 hover:text-white`;
  };

  // Filter navigation items based on the user's role
  const visibleNavItems = navItems.filter(item => {
    if (!item.roles) {
      return true; // Item is visible to all roles
    }
    return role && item.roles.includes(role as UserRole);
  });

  return (
    <aside className="w-64 flex-shrink-0 h-screen flex flex-col p-4 bg-slate-900/40 backdrop-blur-xl border-r border-white/10">
      {/* Logo Section */}
      <div className="flex items-center gap-3 px-4 py-2 mb-8">
        {/* You can replace this with your actual logo component or image */}
        <img src={logoUrl || "/logo.png"} alt="Panda Patches Logo" className="h-8 w-8 object-contain" />
        <span className="text-xl font-bold text-white tracking-tight">
          Panda Patches
        </span>
      </div>

      {/* Navigation Links */}
      <nav className="flex-grow">
        <ul className="space-y-2">
          {visibleNavItems.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} className={getNavLinkClass} end>
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Optional: Footer or User Profile Section */}
      <div className="mt-auto">
        {/* You can add a user profile or logout button here later */}
      </div>
    </aside>
  );
};

export default Sidebar;