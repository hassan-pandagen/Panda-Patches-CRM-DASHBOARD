
import React, { useEffect } from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'info' | 'error';
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 6000); // Auto-dismiss after 6 seconds

    return () => {
      clearTimeout(timer);
    };
  }, [onClose]);

  const baseClasses = 'fixed top-5 right-5 max-w-sm w-full z-50 transition-all duration-200 ease-in-out';
  const typeClasses = {
    info: 'border-blue-500/40 text-blue-400',
    success: 'border-green-500/40 text-green-400',
    error: 'border-[#BC13FE]/40 text-[#BC13FE]',
  };
  const iconClasses = {
    info: 'text-blue-400',
    success: 'text-green-400',
    error: 'text-[#BC13FE]',
  }

  const Icon = () => (
      <svg className={`h-6 w-6 ${iconClasses[type]}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
  );

  return (
    <div className={`${baseClasses} flex items-center gap-3 bg-slate-900/70 border border-slate-700/70 text-gray-200 rounded-lg p-3 shadow-[0_0_20px_rgba(188,19,254,0.15)] ${typeClasses[type]}`}>
      <div className="p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <Icon />
          </div>
          <div className="ml-3 w-0 flex-1">
            <p className="text-sm font-medium text-gray-100">
              Real-Time Notification
            </p>
            <p className="mt-1 text-sm text-gray-300">
              {message}
            </p>
          </div>
          <div className="ml-4 flex-shrink-0 flex">
            <button
              onClick={onClose}
              className="bg-transparent rounded-md inline-flex text-gray-400 hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#BC13FE]/20"
            >
              <span className="sr-only">Close</span>
              <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Toast;
