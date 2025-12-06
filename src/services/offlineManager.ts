// src/services/offlineManager.ts
// ✅ UPGRADE 9: Offline detection and management

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

    // Also periodically check connection by trying to fetch a small resource
    setInterval(() => this.checkConnection(), 30000); // Check every 30 seconds
  }

  /**
   * Register the service worker
   */
  registerServiceWorker = async (): Promise<boolean> => {
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
              // Notify app of update availability
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
    if (this.swRegistration) {
      const success = await this.swRegistration.unregister();
      if (success) {
        logger.info('[Offline Manager] Service Worker unregistered');
      }
    }
  };

  /**
   * Subscribe to online/offline changes
   */
  subscribe = (listener: OfflineListener): (() => void) => {
    this.listeners.add(listener);

    // Immediately call with current state
    listener(this.isOnline);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Check current online status
   */
  getOnlineStatus = (): boolean => {
    return this.isOnline;
  };

  /**
   * Handle online event
   */
  private handleOnline = () => {
    logger.info('[Offline Manager] Back online');
    this.isOnline = true;
    this.notifyListeners();
  };

  /**
   * Handle offline event
   */
  private handleOffline = () => {
    logger.warn('[Offline Manager] Went offline');
    this.isOnline = false;
    this.notifyListeners();
  };

  /**
   * Check connection by fetching small resource with timeout
   */
  private checkConnection = async () => {
    try {
      // ✅ DAY 2 FIX: Add timeout to fetch call (10 seconds)
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
        
        if (fetchErr instanceof DOMException && fetchErr.name === 'AbortError') {
          logger.warn('[Offline Manager] Connection check timeout (10s)');
        } else {
          logger.debug('[Offline Manager] Connection check failed', fetchErr);
        }

        const wasOnline = this.isOnline;
        this.isOnline = false;

        if (wasOnline !== this.isOnline) {
          this.notifyListeners();
        }
      }
    } catch (err) {
      logger.error('[Offline Manager] Unexpected error in checkConnection', err);
      const wasOnline = this.isOnline;
      this.isOnline = false;

      if (wasOnline !== this.isOnline) {
        this.notifyListeners();
      }
    }
  };

  /**
   * Notify all listeners of status change
   */
  private notifyListeners = () => {
    this.listeners.forEach((listener) => {
      try {
        listener(this.isOnline);
      } catch (error) {
        logger.error('[Offline Manager] Listener error', error);
      }
    });
  };

  /**
   * Notify app of service worker update
   */
  private notifyUpdateAvailable = () => {
    // Dispatch custom event
    const event = new CustomEvent('sw-update-available', {
      detail: { hasUpdate: true },
    });
    window.dispatchEvent(event);
  };

  /**
   * Skip waiting and reload
   */
  skipWaitingAndReload = () => {
    if (this.swRegistration && this.swRegistration.waiting) {
      this.swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });

      // Wait for the service worker to activate, then reload
      navigator.serviceWorker.controller?.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    }
  };
}

// Export singleton instance
export const offlineManager = new OfflineManager();
