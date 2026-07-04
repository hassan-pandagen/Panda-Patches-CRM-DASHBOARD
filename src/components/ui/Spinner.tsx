import React from 'react';
import LoadingScreen from './LoadingScreen';

interface SpinnerProps {
  small?: boolean;
  // Accept a size token too (several call sites use size="sm"|"md"|"lg"); "sm" maps to the
  // small spinner, anything else to the default. Kept alongside `small` for back-compat.
  size?: 'sm' | 'md' | 'lg';
  fullScreen?: boolean;
  message?: string;
}

const Spinner: React.FC<SpinnerProps> = ({ small, size, fullScreen, message }) => {
  const isSmall = small ?? size === 'sm';

  // Use full-screen loading for main page loads
  if (fullScreen) {
    return <LoadingScreen message={message} size={isSmall ? 'sm' : 'md'} />;
  }

  const sizeClasses = isSmall ? 'h-5 w-5' : 'h-8 w-8';
  const borderClasses = isSmall ? 'border-2' : 'border-4';

  return (
    <div
      className={`${sizeClasses} ${borderClasses} border-brand-orange border-t-transparent rounded-full animate-spin`}
      role="status"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
};

export default Spinner;
