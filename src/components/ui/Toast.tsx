import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';
import { ToastMessage, ToastType } from '../../contexts/ToastContext';

interface ToastProps extends ToastMessage {
  onDismiss: () => void;
  index: number;
}

const toastConfig: Record<ToastType, { icon: React.FC<any>; color: string }> = {
  success: { icon: CheckCircle, color: 'border-brand-green/50' },
  error: { icon: XCircle, color: 'border-red-500/50' },
  warning: { icon: AlertTriangle, color: 'border-amber-500/50' },
  info: { icon: Info, color: 'border-blue-500/50' },
};

const Toast: React.FC<ToastProps> = ({
  id,
  type,
  title,
  message,
  duration = 4000,
  onDismiss,
  index,
}) => {
  const [isPaused, setIsPaused] = useState(false);
  const { icon: Icon, color } = toastConfig[type];

  useEffect(() => {
    if (isPaused) return;

    const timer = setTimeout(() => {
      onDismiss();
    }, duration);

    return () => clearTimeout(timer);
  }, [id, duration, onDismiss, isPaused]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -50, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{
        opacity: 0,
        x: 100,
        transition: { duration: 0.3, ease: 'easeOut' },
      }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      drag="x"
      dragConstraints={{ left: 0, right: 200 }}
      onDragEnd={(_, info) => {
        if (info.offset.x > 100) {
          onDismiss();
        }
      }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onClick={() => onDismiss()}
      className={`relative w-80 cursor-pointer overflow-hidden rounded-xl border bg-slate-900/60 p-4 shadow-2xl shadow-black/50 backdrop-blur-lg ${color}`}
      style={{ zIndex: 100 - index }}
    >
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-6 w-6 flex-shrink-0 ${color.replace('border-', 'text-')}`} />
        <div className="flex-grow">
          <p className="font-semibold text-white">{title}</p>
          {message && <p className="mt-1 text-sm text-slate-300">{message}</p>}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="ml-2 flex-shrink-0 rounded-full p-1 text-slate-500 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={16} />
        </button>
      </div>

      {/* Progress Bar */}
      <div className="absolute bottom-0 left-0 h-1 w-full bg-white/10">
        <motion.div
          className={`h-full ${color.replace('border-', 'bg-')}`}
          initial={{ width: '100%' }}
          animate={isPaused ? { width: '100%' } : { width: '0%' }}
          transition={{ duration: duration / 1000, ease: 'linear' }}
        />
      </div>
    </motion.div>
  );
};

export default Toast;
