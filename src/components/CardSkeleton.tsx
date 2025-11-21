import React from 'react';
import GlassCard from './ui/GlassCard';
import Skeleton from './ui/Skeleton';

const CardSkeleton: React.FC = () => {
  return (
    <GlassCard padding="md" hover={false} gradient={false}>
      <div className="space-y-3">
        <Skeleton variant="text" width="75%" height={20} />
        <Skeleton variant="text" width="50%" height={36} />
        <Skeleton variant="text" width="60%" height={16} />
      </div>
    </GlassCard>
  );
};

export default CardSkeleton;