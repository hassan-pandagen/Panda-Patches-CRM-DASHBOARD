import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { versionChecker } from '../services/versionChecker';

export const UpdateBanner: React.FC = () => {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const handleUpdateAvailable = () => {
      setShowBanner(true);
    };

    window.addEventListener('app:update-available', handleUpdateAvailable);

    return () => {
      window.removeEventListener('app:update-available', handleUpdateAvailable);
    };
  }, []);

  const handleUpdate = () => {
    versionChecker.forceReload();
  };

  const handleDismiss = () => {
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 animate-slide-down">
      <div className="bg-gradient-to-r from-brand-orange to-orange-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <RefreshCw className="w-5 h-5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-sm">New Version Available!</p>
                <p className="text-xs text-white/90">
                  A new version of the app is available. Please refresh to get the latest features.
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={handleUpdate}
                className="px-4 py-2 bg-white text-brand-orange rounded-lg font-semibold text-sm hover:bg-gray-100 transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Update Now
              </button>
              <button
                onClick={handleDismiss}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};