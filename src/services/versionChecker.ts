// src/services/versionChecker.ts - Auto-detect and notify users of app updates

// ⚠️ STEP 1: CHANGE THIS NUMBER EVERY TIME YOU DEPLOY A BUG FIX
// Example: Change to '2.6.1' next time, then '2.6.2', etc.
const CURRENT_VERSION = '2.6.0'; 

export const versionChecker = {
  init: () => {
    // 1. Get the version currently stored in the user's browser
    const storedVersion = localStorage.getItem('app_version');

    console.log(`[System Check] Code Version: ${CURRENT_VERSION} | Browser Version: ${storedVersion}`);

    // 2. Compare. If they don't match, it means you deployed a new update.
    if (storedVersion !== CURRENT_VERSION) {
      console.warn('🚀 New update detected! Cleaning up old cache...');

      // --- AGGRESSIVE CLEANUP ---
      
      // Clear Local Storage (Removes old state/settings)
      localStorage.clear();
      
      // Clear Session Storage (Removes old session data)
      sessionStorage.clear();
      
      // Unregister Service Workers (Stops the browser from serving old HTML)
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const registration of registrations) {
            registration.unregister();
          }
        });
      }

      // Clear Cache Storage (Deletes old JS/CSS files)
      if ('caches' in window) {
        caches.keys().then((names) => {
          names.forEach((name) => {
            caches.delete(name);
          });
        });
      }

      // 3. Save the NEW version so we don't loop forever
      localStorage.setItem('app_version', CURRENT_VERSION);

      // 4. Force a hard reload from the server
      window.location.reload();
    }
  },

  getVersionInfo: () => CURRENT_VERSION
};
