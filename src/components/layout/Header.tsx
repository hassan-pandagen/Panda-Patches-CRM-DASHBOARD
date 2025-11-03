import React, { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { signOutUser } from "../../services/authService";
import { useAuth } from "../../contexts/AuthContext";
import { SettingsIcon, LogoutIcon } from "../ui/Icons";
import ChangePasswordModal from "../../ChangePasswordModal";
import NotificationBell from "../ui/NotificationBell";

const Header: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const userInitial = user?.email ? user.email.charAt(0).toUpperCase() : "?";
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ✅ Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ✅ Logout handler
  const handleLogout = useCallback(async () => {
    await signOutUser();
  }, []);

  // ✅ Search handler
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (query) {
      navigate(`/search?q=${encodeURIComponent(query)}`);
      setSearchQuery("");
    }
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-x-4 border-b border-slate-800 bg-slate-900/80 px-4 shadow-sm backdrop-blur-sm sm:gap-x-6 lg:px-8">
        <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
          {/* 🔍 Search Bar */}
          <form className="relative flex-1" onSubmit={handleSearchSubmit}>
            <div className="relative w-full">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
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
                className="block w-full rounded-md border-0 bg-slate-800 py-2 pl-10 pr-3 text-slate-300 placeholder:text-slate-400 focus:bg-slate-700 focus:ring-2 focus:ring-blue-500 sm:text-sm sm:leading-6 transition-colors"
                placeholder="Search orders, customers, designs..."
              />
            </div>
          </form>

          {/* 🔔 Notifications */}
          <div className="flex items-center gap-x-4 lg:gap-x-6">
            <NotificationBell />

            {/* 👤 User Menu */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="transition-transform duration-200 hover:scale-105 flex items-center gap-x-3"
              >
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-700 text-slate-300 font-bold">
                  {userInitial}
                </span>
                <div className="hidden sm:flex sm:flex-col sm:items-start">
                  <p className="text-sm font-semibold text-white">
                    {user?.email?.split("@")[0]}
                  </p>
                  <p className="text-xs text-slate-400 capitalize">
                    {user?.role?.toLowerCase() || "User"}
                  </p>
                </div>
              </button>

              <AnimatePresence>
                {isDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="absolute right-0 mt-2 w-56 origin-top-right bg-slate-800/80 backdrop-blur-md border border-slate-700/50 rounded-xl shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50"
                  >
                    <div className="py-2 px-2" role="menu">
                      <div className="px-3 py-2 border-b border-slate-700/50">
                        <p className="text-sm font-medium text-slate-300">
                          Signed in as
                        </p>
                        <p className="text-sm font-semibold text-blue-400 truncate">
                          {user?.email}
                        </p>
                      </div>

                      <div className="py-1">
                        <Link
                          to="/settings"
                          onClick={() => setIsDropdownOpen(false)}
                          className="flex items-center gap-3 w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-700/70 hover:text-slate-100 rounded-md transition-colors duration-200"
                        >
                          <SettingsIcon className="w-4 h-4" />
                          Account Settings
                        </Link>

                        <button
                          onClick={() => {
                            setIsPasswordModalOpen(true);
                            setIsDropdownOpen(false);
                          }}
                          className="flex items-center gap-3 w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-700/70 hover:text-slate-100 rounded-md transition-colors duration-200"
                        >
                          <SettingsIcon className="w-4 h-4" />
                          Change Password
                        </button>
                      </div>

                      <div className="py-1 border-t border-slate-700/50">
                        <button
                          onClick={handleLogout}
                          className="flex items-center gap-3 w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-red-500/20 hover:text-red-300 rounded-md transition-colors duration-200"
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
        </div>
      </header>

      {/* 🔐 Change Password Modal */}
      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
      />
    </>
  );
};

export default Header;
