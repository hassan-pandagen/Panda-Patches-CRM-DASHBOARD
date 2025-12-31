// src/components/ui/StatusBadge.tsx
// Memoized status badge component to prevent unnecessary re-renders

import React, { memo, useMemo } from 'react';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

const StatusBadge = memo<StatusBadgeProps>(({ status, size = 'md' }) => {
  const colors = useMemo(() => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'OVERTIME':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'UNDERTIME':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'INCOMPLETE':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'ABSENT':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'ACTIVE':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  }, [status]);

  const sizeClasses = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-xs';

  return (
    <span className={`${sizeClasses} rounded-lg font-bold border ${colors}`}>
      {status}
    </span>
  );
});

StatusBadge.displayName = 'StatusBadge';

export default StatusBadge;
