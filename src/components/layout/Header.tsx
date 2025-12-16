import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Link } from 'react-router-dom';
import { User, LogOut, Settings, ChevronDown } from 'lucide-react';
import NotificationBell from '../ui/NotificationBell'; // <--- Import the new component

const Header: React.FC = () => {
  const { user, role, signOut, profile } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="relative z-30 flex items-center justify-end h-16 px-6 lg:px-8 bg-slate-900/20 backdrop-blur-sm border-b border-white/10">
      <div className="flex items-center gap-4">
        
        {/* 1. USE THE NEW NOTIFICATION COMPONENT */}
        {/* Only show for Admins */}
        {role === 'ADMIN' && (
            <NotificationBell />
        )}

        {/* 2. USER MENU */}
        <div className="relative" ref={menuRef}>
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={`flex items-center gap-4 p-2 rounded-lg transition-colors ${
              isMenuOpen ? 'bg-white/5' : 'hover:bg-white/5'
            }`}
          >
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-white">{profile?.full_name || user?.email}</p>
              <p className="text-xs text-slate-400">{profile?.role}</p>
            </div>
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-orange to-orange-600 flex items-center justify-center shadow-lg shadow-brand-orange/20 text-white font-bold">
              {profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : <User className="w-5 h-5" />}
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 origin-top-right bg-slate-800/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-200">
              <div className="p-2 space-y-1">
                <Link 
                  to="/settings" 
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/10 hover:text-white rounded-lg transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  <span>Settings</span>
                </Link>
                <button 
                  onClick={() => {
                    setIsMenuOpen(false);
                    signOut();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;