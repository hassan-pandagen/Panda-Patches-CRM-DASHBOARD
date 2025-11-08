import React, { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../contexts/AuthContext";
import { SettingsIcon, LogoutIcon, ShieldIcon } from "../ui/Icons";
import ChangePasswordModal from "../../ChangePasswordModal";
import NotificationBell from "../ui/NotificationBell";

const Header: React.FC = () => {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const userInitial = user?.email ? user.email.charAt(0).toUpperCase() : "?";

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = useCallback(() => logout(), [logout]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (query) {
      navigate(`/search?q=${encodeURIComponent(query)}`);
      setSearchQuery("");
    }
  };

  // Define role label display for readability
  const getRoleLabel = (r: string | null | undefined) => {
    switch (r) {
      case "ADMIN":
        return "Admin";
      case "SALES_AGENT":
        return "Sales Agent";
      case "PRODUCTION_AGENT":
        return "Production Agent";
      default:
        return "User";
    }
  };

  return (
    <>
      <header className="sticky top-0 z-50 flex h-16 items-center border-b border-slate-700/50 bg-slate-900/95 backdrop-blur-lg px-4 lg:px-8">
        <div className="flex w-full items-center justify-between">
          {/* LEFT: (Placeholder) */}
          <div className="flex-1" />

          {/* CENTER: Search bar */}
          <div className="flex-1 flex justify-center px-4">
            <form onSubmit={handleSearchSubmit} className="w-full max-w-xl">
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                  <svg
                    className="h-5 w-5 text-slate-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-full rounded-full border-0 bg-slate-800/80 py-2.5 pl-11 pr-4 text-slate-100 placeholder:text-slate-500 focus:bg-slate-800 focus:ring-2 focus:ring-[#BC13FE] focus:ring-offset-2 focus:ring-offset-slate-900 transition-all duration-200 text-sm font-medium"
                  placeholder="Search orders, customers, designs..."
                />
              </div>
            </form>
          </div>

          {/* RIGHT: Notifications + Profile */}
          <div
            className="flex-1 flex items-center justify-end gap-3 relative"
            ref={dropdownRef}
          >
            <NotificationBell />

            {/* Avatar / Profile Button */}
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="group flex items-center gap-2.5 rounded-full bg-slate-800/50 p-2 hover:bg-slate-700/50 border border-slate-700/30 transition-all duration-200 hover:scale-105"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#BC13FE] to-purple-600 text-white font-bold text-sm shadow-lg">
                {userInitial}
              </div>
              <div className="hidden lg:block text-left">
                <p className="text-xs font-semibold text-white group-hover:text-[#BC13FE] transition-colors">
                  {user?.email?.split("@")[0]}
                </p>
                <p className="text-xs text-slate-400 capitalize">
                  {getRoleLabel(role)}
                </p>
              </div>
            </button>

            {/* Dropdown Menu */}
            <AnimatePresence>
              {isDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-4 top-14 w-72 origin-top-right rounded-2xl bg-slate-800/95 backdrop-blur-xl border border-slate-700 shadow-2xl ring-1 ring-white/5 z-50"
                >
                  <div className="p-4">
                    <div className="border-b border-slate-700 pb-3 mb-3">
                      <p className="text-xs text-slate-400">Signed in as</p>
                      <p className="text-sm font-medium text-[#BC13FE] truncate">
                        {user?.email}
                      </p>
                    </div>

                    <div className="space-y-1">
                      {role === "ADMIN" && (
                        <Link
                          to="/settings"
                          onClick={() => setIsDropdownOpen(false)}
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-700/50 hover:text-white transition-all"
                        >
                          <ShieldIcon className="w-4 h-4" />
                          Admin Settings
                        </Link>
                      )}

                      <button
                        onClick={() => {
                          setIsPasswordModalOpen(true);
                          setIsDropdownOpen(false);
                        }}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-700/50 hover:text-white text-left transition-all"
                      >
                        <SettingsIcon className="w-4 h-4" />
                        Change Password
                      </button>
                    </div>

                    <div className="border-t border-slate-700 pt-3 mt-3">
                      <button
                        onClick={handleLogout}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-all"
                      >
                        <LogoutIcon className="w-4 h-4" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
      />
    </>
  );
};

export default Header;
