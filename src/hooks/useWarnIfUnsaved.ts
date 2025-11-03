import { useState, useEffect, useCallback } from 'react';
import { useBlocker } from 'react-router-dom';

interface Blocker {
  state: 'unblocked' | 'blocked' | 'proceeding';
  proceed: () => void;
  reset: () => void;
}

export const useWarnIfUnsaved = (isDirty: boolean) => {
  const [showModal, setShowModal] = useState(false);
  const blocker = useBlocker(isDirty) as Blocker;

  useEffect(() => {
    setShowModal(blocker.state === 'blocked');
  }, [blocker.state]);

  const confirmLeave = useCallback(() => blocker.proceed?.(), [blocker]);
  const cancelLeave = useCallback(() => blocker.reset?.(), [blocker]);

  return { showModal, confirmLeave, cancelLeave };
};