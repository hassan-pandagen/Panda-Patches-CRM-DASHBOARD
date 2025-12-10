// src/services/offlineManager.ts
// ✅ UPGRADE 9: Offline detection and management (SAFE VERSION)

import { logger } from './logger';

interface OfflineListener {
  (isOnline: boolean): void;
}

class OfflineManager {
  private listeners: Set<OfflineListener> = new Set();
  private isOnline: boolean = navigator.onLine;
  private swRegistration: ServiceWorkerRegistration | null = null;

  constructor() {
    // Listen to online/offline events
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);

    // Also periodically check connection
    // Only run the interval check in Production to save resources in Dev
    if (import.meta.env.PROD) {
      setInterval(() => this.checkConnection(), 30000); 
    }
  }

  /**
   * Register the service worker
   * ✅ NOW SAFE: Only runs in Production
   */
  registerServiceWorker = async (): Promise<boolean> => {
    // 🛑 1. DEVELOPMENT CHECK: Stop immediately if on localhost
    if (!import.meta.env.PROD) {
      logger.info('[Offline Manager] Development mode detected. Service Worker disabled.');
      
      // Cleanup: If a SW exists from before, kill it to prevent "Zombie" issues
      this.unregisterServiceWorker();
      return false;
    }

    // 🛑 2. BROWSER SUPPORT CHECK
    if (!('serviceWorker' in navigator)) {
      logger.warn('[Offline Manager] Service Workers not supported');
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js', {
        scope: '/',
      });

      this.swRegistration = registration;
      logger.info('[Offline Manager] Service Worker registered');

      // Listen for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              logger.info('[Offline Manager] New service worker available');
              this.notifyUpdateAvailable();
            }
          });
        }
      });

      return true;
    } catch (error) {
      logger.error('[Offline Manager] Service Worker registration failed', error);
      return false;
    }
  };

  /**
   * Unregister service worker (for cleanup)
   */
  unregisterServiceWorker = async (): Promise<void> => {
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
          logger.info('[Offline Manager] Zombie Service Worker unregistered');
        }
      } catch (error) {
        console.error('Failed to unregister SW:', error);
      }
    }
  };

  /**
   * Subscribe to online/offline changes
   */
  subscribe = (listener: OfflineListener): (() => void) => {
    this.listeners.add(listener);

    listener(this.isOnline);

    return () => { this.listeners.delete(listener); };
  };

  /**
   * Check current online status
   */
  getOnlineStatus = (): boolean => {
    return this.isOnline;
  };

  private handleOnline = () => {
    logger.info('[Offline Manager] Back online');
    this.isOnline = true;
    this.notifyListeners();
  };

  private handleOffline = () => {
    logger.warn('[Offline Manager] Went offline');
    this.isOnline = false;
    this.notifyListeners();
  };

  private checkConnection = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch('/index.html', {
          method: 'HEAD',
          cache: 'no-store',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const wasOnline = this.isOnline;
        this.isOnline = response.ok;

        if (wasOnline !== this.isOnline) {
          this.notifyListeners();
        }
      } catch (fetchErr: any) {
        clearTimeout(timeoutId);
        // Silent fail in logs is better for polling
        const wasOnline = this.isOnline;
        this.isOnline = false;

        if (wasOnline !== this.isOnline) {
          this.notifyListeners();
        }
      }
    } catch (err) {
      this.isOnline = false;
    }
  };

  private notifyListeners = () => {
    this.listeners.forEach((listener) => {
      try {
        listener(this.isOnline);
      } catch (error) {
        logger.error('[Offline Manager] Listener error', error);
      }
    });
  };

  private notifyUpdateAvailable = () => {
    const event = new CustomEvent('sw-update-available', {
      detail: { hasUpdate: true },
    });
    window.dispatchEvent(event);
  };

  skipWaitingAndReload = () => {
    if (this.swRegistration && this.swRegistration.waiting) {
      this.swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });

      navigator.serviceWorker.controller?.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    }
  };
}

export const offlineManager = new OfflineManager();
