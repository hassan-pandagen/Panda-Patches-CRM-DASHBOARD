import React from 'react';
import SpotlightCard from './ui/SpotlightCard';
import Skeleton from './ui/Skeleton';

const CardSkeleton: React.FC = () => {
  return (
    <SpotlightCard className="p-6">
      <div className="space-y-3">
        <Skeleton variant="text" width="75%" height={20} />
        <Skeleton variant="text" width="50%" height={36} />
        <Skeleton variant="text" width="60%" height={16} />
      </div>
    </SpotlightCard>
  );
};

export default CardSkeleton;