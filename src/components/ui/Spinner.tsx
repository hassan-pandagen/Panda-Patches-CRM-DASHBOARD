import React from 'react';
import LoadingScreen from './LoadingScreen';

interface SpinnerProps {
  small?: boolean;
  fullScreen?: boolean;
  message?: string;
}

const Spinner: React.FC<SpinnerProps> = ({ small, fullScreen, message }) => {
  // Use full-screen loading for main page loads
  if (fullScreen) {
    return <LoadingScreen message={message} size={small ? 'sm' : 'md'} />;
  }

  const sizeClasses = small ? 'h-5 w-5' : 'h-8 w-8';
  const borderClasses = small ? 'border-2' : 'border-4';

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
