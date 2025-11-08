import { useCallback, useEffect, useState, useSyncExternalStore, useRef } from "react";
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
    return () => listeners.delete(listener);
  },
  getSnapshot: () => dirtyComponents.size > 0,
};
export function useWarnIfUnsaved(isDirty: boolean) {
  const [showModal, setShowModal] = useState(false);  
  const [componentKey] = useState(() => Symbol());
  const isDirtyRef = useRef(isDirty);

  // Keep ref in sync
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  // 🧭 Handle internal navigation
  const blocker = useBlocker(isDirty);

  useEffect(() => {
    if (blocker.state === "blocked") {
      setShowModal(true);
    }
  }, [blocker.state]);
  
  // 🌐 Handle browser/tab close
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

  const isAnyDirty = useSyncExternalStore(
    dirtyStore.subscribe, 
    dirtyStore.getSnapshot, 
    () => false
  );

  // Enhanced beforeunload handler
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Double check using both the store and local ref
      if (isAnyDirty || isDirtyRef.current) {
        console.log("Blocking unload - dirty state detected");
        event.preventDefault();
        event.returnValue = "unsaved-changes";
      }
    };

    // Use capture phase to ensure we catch the event
    window.addEventListener("beforeunload", handleBeforeUnload, { capture: true });
    
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload, { capture: true });
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