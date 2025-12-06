// src/hooks/useWarnIfUnsaved.ts - FIXED VERSION

import { useCallback, useEffect, useState, useSyncExternalStore, useRef } from "react";
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
  const shouldBlockRef = useRef(false);

  // Update ref whenever blocking condition changes
  useEffect(() => {
    shouldBlockRef.current = isDirty && !forceAllow;
  }, [isDirty, forceAllow]);

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
      console.log(`[useWarnIfUnsaved] Component added to dirty store. isDirty: ${isDirty}, forceAllow: ${forceAllow}`);
    } else {
      dirtyStore.delete(componentKey);
      console.log(`[useWarnIfUnsaved] Component removed from dirty store. isDirty: ${isDirty}, forceAllow: ${forceAllow}`);
    }

    return () => {
      dirtyStore.delete(componentKey);
      console.log(`[useWarnIfUnsaved] Component cleaned up from dirty store.`);
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
      // Check the ref for most current state
      if (shouldBlockRef.current) {
        event.preventDefault();
        event.returnValue = "You have unsaved changes. Are you sure you want to leave?";
        return event.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []); // Empty deps - use ref instead

  // 🔙 Handle browser back/forward buttons
  useEffect(() => {
    let isModalShowing = false;

    const handlePopState = (event: PopStateEvent) => {
      // Use ref for most current state
      if (shouldBlockRef.current && !isModalShowing) {
        // Prevent the navigation
        event.preventDefault();
        window.history.pushState(null, "", window.location.href);
        isModalShowing = true;
        setShowModal(true);
      }
    };

    // Push initial state to enable back button blocking
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", handlePopState);
    
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []); // Empty deps - use ref instead

  const confirmLeave = useCallback(() => {
    setShowModal(false);
    // Clear the blocking state
    shouldBlockRef.current = false;
    
    // Proceed with React Router navigation
    if (blocker.state === "blocked") {
      blocker.proceed?.();
    } else {
      // If it was a browser back button, go back
      window.history.back();
    }
  }, [blocker]);

  const cancelLeave = useCallback(() => {
    setShowModal(false);
    blocker.reset?.();
  }, [blocker]);

  return { showModal, confirmLeave, cancelLeave };
}