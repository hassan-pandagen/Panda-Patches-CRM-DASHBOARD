import { useCallback, useEffect, useState } from "react";
import { useBlocker } from "react-router-dom";

/**
 * Warns the user when navigating away with unsaved changes.
 * Works for both browser unload and internal route changes.
 */
export function useWarnIfUnsaved(isDirty: boolean) {
  const [showModal, setShowModal] = useState(false);

  // 🧭 Handle internal navigation
  const blocker = useBlocker(isDirty);

  useEffect(() => {
    if (blocker.state === "blocked") {
      setShowModal(true);
    }
  }, [blocker.state]);


  // 🌐 Handle browser/tab close
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

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