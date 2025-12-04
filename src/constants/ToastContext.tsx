import React, { createContext, useState, useCallback, ReactNode } from 'react';
import { X, CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

export interface ToastContextType {
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 11);
    setToasts((prev) => [...prev, { ...toast, id }]);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const getToastStyles = (type: Toast['type']) => {
    switch (type) {
      case 'success':
        return {
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/30',
          text: 'text-emerald-400',
          icon: <CheckCircle className="w-5 h-5" />,
        };
      case 'error':
        return {
          bg: 'bg-red-500/10',
          border: 'border-red-500/30',
          text: 'text-red-400',
          icon: <XCircle className="w-5 h-5" />,
        };
      case 'warning':
        return {
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/30',
          text: 'text-amber-400',
          icon: <AlertCircle className="w-5 h-5" />,
        };
      case 'info':
        return {
          bg: 'bg-blue-500/10',
          border: 'border-blue-500/30',
          text: 'text-blue-400',
          icon: <Info className="w-5 h-5" />,
        };
    }
  };

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}

      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => {
            const styles = getToastStyles(toast.type);
            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 100, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className={`
                  ${styles.bg} ${styles.border} ${styles.text}
                  backdrop-blur-xl border rounded-xl shadow-2xl
                  px-4 py-3 min-w-[320px] max-w-md
                  pointer-events-auto
                  flex items-start gap-3
                `}
              >
                {/* Icon */}
                <div className="flex-shrink-0 mt-0.5">
                  {styles.icon}
                </div>

                {/* Message */}
                <div className="flex-1 text-sm font-medium">
                  {toast.message}
                </div>

                {/* Close Button */}
                <button
                  onClick={() => removeToast(toast.id)}
                  className="flex-shrink-0 hover:opacity-70 transition-opacity"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};