import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useCustomerAuth } from '../../contexts/CustomerAuthContext';
import { LayoutDashboard, Package, User, LogOut, Menu, X, MessageCircle, HelpCircle } from 'lucide-react';
import CustomerNotificationBell from './CustomerNotificationBell';

const navItems = [
  { to: '/customer/dashboard', icon: LayoutDashboard, label: 'My Orders' },
  { to: '/customer/profile', icon: User, label: 'Profile' },
  { to: '/customer/help', icon: HelpCircle, label: 'Help' },
];

const CustomerLayout: React.FC = () => {
  const { profile, signOut } = useCustomerAuth();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/customer/login');
  };

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo + Nav */}
            <div className="flex items-center gap-8">
              <NavLink to="/customer/dashboard" className="flex items-center gap-2">
                <img src="/panda-logo.png" alt="Panda Patches" className="h-8" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                <span className="text-white font-bold text-lg hidden sm:block">Panda Patches</span>
              </NavLink>

              {/* Desktop Nav */}
              <nav className="hidden md:flex items-center gap-1">
                {navItems.map(({ to, icon: Icon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        isActive
                          ? 'bg-brand-orange text-white'
                          : 'text-slate-400 hover:text-white hover:bg-white/5'
                      }`
                    }
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </NavLink>
                ))}
              </nav>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3">
              <CustomerNotificationBell />

              <div className="hidden sm:flex items-center gap-3 pl-3 border-l border-slate-700">
                <div className="text-right">
                  <p className="text-sm font-medium text-white truncate max-w-[150px]">
                    {profile?.full_name || profile?.email?.split('@')[0] || 'Customer'}
                  </p>
                  <p className="text-xs text-slate-500 truncate max-w-[150px]">{profile?.email}</p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>

              {/* Mobile menu button */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden p-2 text-slate-400 hover:text-white rounded-lg"
              >
                {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-white/10 bg-slate-900/95 backdrop-blur-xl">
            <div className="px-4 py-3 space-y-1">
              {navItems.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-brand-orange text-white'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </NavLink>
              ))}
              <button
                onClick={handleSignOut}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-red-400 hover:bg-red-400/10 w-full"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>

      {/* Tawk.to Widget — pre-filled with customer identity */}
      <TawkToWidget
        name={profile?.full_name || profile?.email?.split('@')[0]}
        email={profile?.email}
      />
    </div>
  );
};

// Tawk.to widget — pre-fills visitor context so agents see who is chatting
// Uses Vite env vars if set, otherwise falls back to the hardcoded property/widget IDs
const TAWK_PROPERTY_ID =
  (import.meta as any).env?.VITE_TAWK_PROPERTY_ID || '64b56d7d94cf5d49dc6422c0';
const TAWK_WIDGET_ID =
  (import.meta as any).env?.VITE_TAWK_WIDGET_ID || '1h5ib7cm1';

const TawkToWidget: React.FC<{ name?: string; email?: string }> = ({ name, email }) => {
  React.useEffect(() => {
    // Set visitor attributes before loading so they appear in agent dashboard
    (window as any).Tawk_API = (window as any).Tawk_API || {};
    (window as any).Tawk_LoadStart = new Date();

    if (name || email) {
      (window as any).Tawk_API.onLoad = function () {
        (window as any).Tawk_API.setAttributes(
          {
            name:  name  || 'Customer',
            email: email || '',
          },
          function (err: any) { if (err) console.warn('[Tawk] setAttributes error', err); }
        );
      };
    }

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://embed.tawk.to/${TAWK_PROPERTY_ID}/${TAWK_WIDGET_ID}`;
    script.charset = 'UTF-8';
    script.setAttribute('crossorigin', '*');
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) document.body.removeChild(script);
    };
  }, [name, email]);

  return null;
};

export default CustomerLayout;
