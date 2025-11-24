// src/hooks/useWarnIfUnsaved.ts - FINAL UNIFIED VERSION

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useBlocker } from "react-router-dom";

/**
 * External store to track dirty components across the app
 */
const dirtyComponents = new Set<symbol>();
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

const dirtyStore = {
  add: (key: symbol) => { dirtyComponents.add(key); notify(); },
  delete: (key: symbol) => { dirtyComponents.delete(key); notify(); },
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: () => dirtyComponents.size > 0,
};

/**
 * Warns user when navigating away with unsaved changes.
 * Handles both browser unload and internal route changes.
 * 
 * @param isDirty - Whether the form has unsaved changes
 * @param forceAllow - Set to true after successful save to bypass blocking
 */
export function useWarnIfUnsaved(isDirty: boolean, forceAllow: boolean = false) {
  const [showModal, setShowModal] = useState(false);  
  const [componentKey] = useState(() => Symbol());

  // 🧭 Handle internal navigation - only block if dirty AND not force allowed
  const blocker = useBlocker(isDirty && !forceAllow);

  useEffect(() => {
    if (blocker.state === "blocked") {
      setShowModal(true);
    }
  }, [blocker.state]);
  
  // 🌐 Track this component's dirty state in the global store
  useEffect(() => {
    if (isDirty && !forceAllow) {
      dirtyStore.add(componentKey);
    } else {
      dirtyStore.delete(componentKey);
    }

    return () => {
      dirtyStore.delete(componentKey);
    };
  }, [isDirty, forceAllow, componentKey]);

  // Subscribe to global dirty state
  const isAnyDirty = useSyncExternalStore(
    dirtyStore.subscribe, 
    dirtyStore.getSnapshot, 
    () => false
  );

  // 🚪 Handle browser/tab close - native browser dialog
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Only warn if something is dirty AND not force allowed
      if ((isAnyDirty || isDirty) && !forceAllow) {
        event.preventDefault();
        event.returnValue = "You have unsaved changes. Are you sure you want to leave?";
        return event.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isAnyDirty, isDirty, forceAllow]);

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