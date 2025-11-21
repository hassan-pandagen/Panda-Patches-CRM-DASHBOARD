import React from 'react';

interface SkeletonProps {
  /** The shape of the skeleton. */
  variant?: 'text' | 'circular' | 'rectangular';
  /** The width of the skeleton. */
  width?: string | number;
  /** The height of the skeleton. */
  height?: string | number;
  /** The type of animation. */
  animation?: 'pulse' | 'wave' | 'none';
  /** Additional CSS classes. */
  className?: string;
}

const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'text',
  width,
  height,
  animation = 'wave',
  className = '',
}) => {
  const baseClasses = 'bg-slate-700/50';

  const variantClasses = {
    text: 'rounded-md',
    circular: 'rounded-full',
    rectangular: '',
  };

  const animationClasses = {
    pulse: 'animate-pulse',
    wave: 'relative overflow-hidden after:absolute after:inset-0 after:-translate-x-full after:animate-[shimmer_2s_infinite] after:bg-gradient-to-r after:from-transparent after:via-slate-600/30 after:to-transparent',
    none: '',
  };

  const style = { width, height };

  return <div className={`${baseClasses} ${variantClasses[variant]} ${animationClasses[animation]} ${className}`} style={style} />;
};

export default Skeleton;