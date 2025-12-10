// src/services/versionChecker.ts - Auto-detect and notify users of app updates

import { logger } from './logger';

// Get build version from Vite's define
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

const CURRENT_VERSION = __APP_VERSION__;
const BUILD_TIME = __BUILD_TIME__;
const VERSION_CHECK_KEY = 'app_version';
const VERSION_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

export const versionChecker = {
  // Store current version in localStorage
  saveVersion() {
    try {
      localStorage.setItem(VERSION_CHECK_KEY, CURRENT_VERSION);
      localStorage.setItem(`${VERSION_CHECK_KEY}_build_time`, BUILD_TIME);
    } catch (e) {
      logger.error('Failed to save version:', e);
    }
  },

  // Check if version has changed
  hasVersionChanged(): boolean {
    try {
      const storedVersion = localStorage.getItem(VERSION_CHECK_KEY);

      // First time - no version stored yet
      if (!storedVersion) {
        this.saveVersion();
        return false;
      }

      // Version changed
      if (storedVersion !== CURRENT_VERSION) {
        logger.info('Version changed:', {
          old: storedVersion,
          new: CURRENT_VERSION,
        });
        return true;
      }

      return false;
    } catch (e) {
      logger.error('Failed to check version:', e);
      return false;
    }
  },

  // Get current version info
  getVersionInfo() {
    return {
      version: CURRENT_VERSION,
      buildTime: BUILD_TIME,
    };
  },

  // Initialize version checking
  init() {
    // Check if we just loaded a new version
    if (this.hasVersionChanged()) {
      logger.info('New version detected, clearing caches');

      // Clear service worker cache if available
      if ('serviceWorker' in navigator && 'caches' in window) {
        caches
          .keys()
          .then((names) => {
            names.forEach((name) => caches.delete(name));
          })
          .catch((err) => {
            logger.error('Failed to clear caches:', err);
          });
      }

      // Save new version
      this.saveVersion();

      // Show update notification
      this.notifyUpdate();
    } else {
      this.saveVersion();
    }

    // Set up periodic version check (for long-running sessions)
    this.startPeriodicCheck();
  },

  // Notify user of update
  notifyUpdate() {
    logger.info('App has been updated to version:', CURRENT_VERSION);

    // Dispatch event that your app can listen to
    window.dispatchEvent(
      new CustomEvent('app:update-available', {
        detail: { version: CURRENT_VERSION },
      })
    );
  },

  // Periodic check for updates (for SPAs that run for long periods)
  startPeriodicCheck() {
    setInterval(() => {
      // Fetch a cache-busted version of index.html
      fetch(`/index.html?t=${Date.now()}`, {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache',
        },
      })
        .then((response) => response.text())
        .then((html) => {
          // Extract script hash from HTML to detect new build
          const scriptMatch = html.match(/src="\/assets\/index-([a-zA-Z0-9]+)\.js"/);
          const currentScriptElement = document.querySelector(
            'script[src*="/assets/index-"]'
          );
          const currentScriptMatch = currentScriptElement
            ?.getAttribute('src')
            ?.match(/index-([a-zA-Z0-9]+)\.js/);

          if (scriptMatch && currentScriptMatch) {
            const newHash = scriptMatch[1];
            const currentHash = currentScriptMatch[1];

            if (newHash !== currentHash) {
              logger.info('New version detected via periodic check', {
                current: currentHash,
                new: newHash,
              });

              // Notify of update
              this.notifyUpdate();
            }
          }
        })
        .catch((err) => {
          logger.error('Version check failed:', err);
        });
    }, VERSION_CHECK_INTERVAL);
  },

  // Force reload the app
  forceReload() {
    logger.info('Forcing app reload');
    window.location.reload();
  },
};

// Auto-initialize on page load
if (typeof window !== 'undefined') {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      versionChecker.init();
    });
  } else {
    versionChecker.init();
  }
}
