import React, { useContext } from 'react';
// Use a relative path to ensure Vercel can find the context
import { ToastContext } from '../constants/ToastContext';

export const useToast = () => {
  const context = useContext(ToastContext);
  
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }

  return {
    success: (message: string, subtitle?: string) => {
      context.addToast({ type: 'success', message: subtitle ? `${message}: ${subtitle}` : message });
    },
    error: (message: string, subtitle?: string) => {
      context.addToast({ type: 'error', message: subtitle ? `${message}: ${subtitle}` : message });
    },
    warning: (message: string, subtitle?: string) => {
      context.addToast({ type: 'warning', message: subtitle ? `${message}: ${subtitle}` : message });
    },
    info: (message: string, subtitle?: string) => {
      context.addToast({ type: 'info', message: subtitle ? `${message}: ${subtitle}` : message });
    },
  };
};