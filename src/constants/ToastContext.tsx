import React, { createContext, useState, useCallback, ReactNode } from 'react';
import { AnimatePresence } from 'framer-motion';
import Toast from '../components/ui/Toast';

export type ToastType = 'success' | 'error' | 'warning' | 'info';
export type ToastPosition =
  | 'top-right'
  | 'top-left'
  | 'bottom-right'
  | 'bottom-left'
  | 'top-center'
  | 'bottom-center';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  position?: ToastPosition;
}

export interface ToastContextType {
  showToast: (toast: Omit<ToastMessage, 'id'>) => void;
}

export const ToastContext = createContext<ToastContextType | undefined>(undefined);

const MAX_VISIBLE_TOASTS = 3;

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = Date.now().toString() + Math.random().toString();
    setToasts(currentToasts => {
      const newToasts = [...currentToasts, { ...toast, id }];
      // Limit the number of visible toasts
      return newToasts.slice(-MAX_VISIBLE_TOASTS);
    });
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(currentToasts => currentToasts.filter(toast => toast.id !== id));
  }, []);

  const getPositionClasses = (position: ToastPosition) => {
    switch (position) {
      case 'top-left': return 'top-4 left-4';
      case 'top-center': return 'top-4 left-1/2 -translate-x-1/2';
      case 'bottom-right': return 'bottom-4 right-4';
      case 'bottom-left': 'bottom-4 left-4';
      case 'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2';
      default: return 'top-4 right-4'; // top-right
    }
  };

  // Group toasts by position
  const toastsByPosition = toasts.reduce((acc, toast) => {
    const pos = toast.position || 'top-right';
    if (!acc[pos]) {
      acc[pos] = [];
    }
    acc[pos].push(toast);
    return acc;
  }, {} as Record<ToastPosition, ToastMessage[]>);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {Object.entries(toastsByPosition).map(([position, positionToasts]) => (
        <div
          key={position}
          className={`fixed z-[9999] flex flex-col gap-3 ${getPositionClasses(position as ToastPosition)}`}
        >
          <AnimatePresence>
            {positionToasts.map((toast, index) => (
              <Toast
                key={toast.id}
                {...toast}
                onDismiss={() => removeToast(toast.id)}
                index={index}
              />
            ))}
          </AnimatePresence>
        </div>
      ))}
    </ToastContext.Provider>
  );
};