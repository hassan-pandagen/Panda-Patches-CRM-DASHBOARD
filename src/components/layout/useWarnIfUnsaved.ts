import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useBlocker } from "react-router-dom";

/**
 * A simple external store to track if any component on the page is dirty.
 */
const dirtyComponents = new Set<symbol>();
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

const dirtyStore = {
  add: (key: symbol) => { dirtyComponents.add(key); notify(); },
  delete: (key: symbol) => { dirtyComponents.delete(key); notify(); },
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => dirtyComponents.size > 0,
};

/**
 * Warns the user when navigating away with unsaved changes.
 * Works for both browser unload and internal route changes.
 */
export function useWarnIfUnsaved(isDirty: boolean) {
  const [showModal, setShowModal] = useState(false);  
  const [componentKey] = useState(() => Symbol());

  // 🧭 Handle internal navigation (your existing modal)
  const blocker = useBlocker(isDirty);

  useEffect(() => {
    if (blocker.state === "blocked") {
      setShowModal(true);
    }
  }, [blocker.state]);
  
  // 🌐 Handle browser/tab close (browser's native dialog)
  useEffect(() => {
    if (isDirty) {
      dirtyStore.add(componentKey);
    } else {
      dirtyStore.delete(componentKey);
    }

    return () => {
      dirtyStore.delete(componentKey);
    };
  }, [isDirty, componentKey]);

  // Subscribe to know if ANY component is dirty
  const isAnyDirty = useSyncExternalStore(
    dirtyStore.subscribe, 
    dirtyStore.getSnapshot, 
    () => false
  );

  // This is the key part - browser close/tab close detection
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isAnyDirty) {
        // Modern browsers require BOTH preventDefault AND returnValue
        event.preventDefault();
        
        // Chrome/Edge require this to be set to a string (can be empty)
        event.returnValue = "You have unsaved changes. Are you sure you want to leave?";
        
        // Return a string for older browsers
        return "You have unsaved changes. Are you sure you want to leave?";
      }
    };

    // Add the event listener
    window.addEventListener("beforeunload", handleBeforeUnload);
    
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isAnyDirty]);

  const confirmLeave = useCallback(() => {
    setShowModal(false);
    blocker.proceed?.();
  }, [blocker]);

  const cancelLeave = useCallback(() => {
    setShowModal(false);
    blocker.reset?.();
  }, [blocker]);

  return { showModal, confirmLeave, cancelLeave };
}