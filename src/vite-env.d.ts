/// <reference types="vite/client" />

/**
 * Vite-injected global constants from vite.config.ts
 */
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

/**
 * Custom events fired by the version checker and app
 */
interface WindowEventMap {
  'app:update-available': CustomEvent<{ version: string }>;
}

declare global {
  interface Window {
    addEventListener<K extends keyof WindowEventMap>(
      type: K,
      listener: (this: Window, ev: WindowEventMap[K]) => void,
    ): void;
    removeEventListener<K extends keyof WindowEventMap>(
      type: K,
      listener: (this: Window, ev: WindowEventMap[K]) => void,
    ): void;
  }
}