// src/components/OfflineIndicator.tsx
// ✅ UPGRADE 9: Shows when app is offline

import React, { useEffect, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { offlineManager } from '../services/offlineManager';

const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(true);
  const [showNotification, setShowNotification] = useState(false);

  useEffect(() => {
    // Subscribe to online/offline changes
    const unsubscribe = offlineManager.subscribe((online) => {
      setIsOnline(online);

      // Show notification briefly when status changes
      if (!online) {
        setShowNotification(true);
        // Keep notification visible while offline
      } else {
        setShowNotification(false);
      }
    });

    return unsubscribe;
  }, []);

  if (!showNotification) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      <div
        className={`
          px-4 py-3 text-center text-sm font-medium transition-all duration-300
          ${
            isOnline
              ? 'bg-green-500/90 text-white'
              : 'bg-red-500/90 text-white'
          }
        `}
      >
        <div className="flex items-center justify-center gap-2">
          {isOnline ? (
            <>
              <Wifi className="w-4 h-4" />
              <span>Back online</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4" />
              <span>You're offline - cached data only</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default OfflineIndicator;
