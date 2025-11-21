import { useContext } from 'react';
import { ToastContext, ToastContextType } from '../constants/ToastContext';

/**
 * `useToast` is a custom hook that provides a simple way to show toast notifications.
 * It must be used within a `ToastProvider`.
 *
 * @example
 * const { showToast } = useToast();
 * showToast({
 *   type: 'success',
 *   title: 'Success!',
 *   message: 'Your action was completed.',
 * });
 */
export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export default useToast;