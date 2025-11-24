// src/hooks/useToast.ts
import { useContext } from 'react';
import { ToastContext } from '@/constants/ToastContext';

export const useToast = () => {
  const context = useContext(ToastContext);
  
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }

  const { showToast } = context;

  // We return an object containing the helper functions directly.
  return {
    success: (title: string, message?: string, duration?: number) => 
      showToast({ type: 'success', title, message, duration }),
      
    error: (title: string, message?: string, duration?: number) => 
      showToast({ type: 'error', title, message, duration }),
      
    warning: (title: string, message?: string, duration?: number) => 
      showToast({ type: 'warning', title, message, duration }),
      
    info: (title: string, message?: string, duration?: number) => 
      showToast({ type: 'info', title, message, duration }),
      
    showToast // Allow raw access if needed
  };
};