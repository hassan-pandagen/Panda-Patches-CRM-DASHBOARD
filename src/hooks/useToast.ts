import { useContext } from 'react';
// Use a relative path to ensure Vercel can find the context
import { ToastContext } from '../constants/ToastContext';

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};