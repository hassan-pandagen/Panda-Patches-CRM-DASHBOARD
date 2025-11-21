import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { OrderStatus } from '../../types';
import { getStatusInfo } from '../../constants/statusInfo';

interface StatusBadgeProps {
  status: OrderStatus;
  size?: 'sm' | 'md';
  showIcon?: boolean;
  tooltip?: string;
  animated?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
};

const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'sm',
  showIcon = true,
  tooltip,
  animated = true,
  className = '',
}) => {
  const { label, icon: Icon, color } = getStatusInfo(status);

  const isPending = (status === OrderStatus.NEW_ORDER || status === OrderStatus.AWAITING_APPROVAL) && animated;
  const isInProduction = status === OrderStatus.IN_PRODUCTION && animated;

  return (
    <div
      className={`group relative inline-flex items-center gap-2 font-semibold rounded-full border backdrop-blur-sm transition-all duration-300 ${sizeClasses[size]} ${color} ${className}`}
      title={tooltip}
      aria-label={`Status: ${label}`}
    >
      {showIcon && (
        <AnimatePresence>
          <motion.div
            key={status}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            <Icon
              className={`
                ${size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'}
                ${isInProduction ? 'animate-spin' : ''}
              `}
            />
          </motion.div>
        </AnimatePresence>
      )}

      {/* Pulsing dot for Pending status */}
      {isPending && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-current"></span>
        </span>
      )}

      <span>{label}</span>

      {tooltip && (
        <div className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
          {tooltip}
        </div>
      )}
    </div>
  );
};

export default StatusBadge;