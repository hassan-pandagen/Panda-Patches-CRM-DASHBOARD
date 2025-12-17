import React, { useMemo } from 'react';
import logoSrc from '../../assets/logo.png';

interface LoadingScreenProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ 
  message,
  size = 'md' 
}) => {
  // Contextual loading messages based on time
  const messages = [
    "Loading your dashboard...",
    "Syncing orders...",
    "Fetching reports...",
    "Preparing your workspace...",
    "Stitching magic...",
    "Crafting your experience...",
    "Gathering data...",
    "Almost there...",
  ];

  const displayMessage = useMemo(() => {
    if (message) return message;
    return messages[Math.floor(Math.random() * messages.length)];
  }, [message]);

  const sizeConfig = {
    sm: {
      logo: 'h-16 w-16',
      title: 'text-lg',
      spinner: 'w-20 h-20',
    },
    md: {
      logo: 'h-24 w-24',
      title: 'text-xl',
      spinner: 'w-32 h-32',
    },
    lg: {
      logo: 'h-32 w-32',
      title: 'text-2xl',
      spinner: 'w-40 h-40',
    },
  };

  const config = sizeConfig[size];

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-20 w-96 h-96 bg-brand-orange/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 left-20 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-6">
        {/* Animated Logo Container */}
        <div className="relative flex items-center justify-center">
          {/* Rotating outer ring */}
          <div 
            className={`absolute ${config.spinner} border-4 border-brand-orange/20 rounded-full`}
            style={{
              animation: 'spin 8s linear infinite',
              boxShadow: '0 0 40px rgba(251, 110, 29, 0.2)',
            }}
          />

          {/* Pulsing middle ring */}
          <div 
            className={`absolute ${config.spinner} border-2 border-transparent border-t-brand-orange border-r-brand-orange rounded-full`}
            style={{
              animation: 'spin 3s linear infinite reverse',
              opacity: 0.6,
            }}
          />

          {/* Logo */}
          <div className={`relative z-20 ${config.logo} flex items-center justify-center`}>
            <img 
              src={logoSrc}
              alt="Panda Patches"
              className="h-full w-full object-contain drop-shadow-2xl"
              style={{
                filter: 'drop-shadow(0 0 20px rgba(251, 110, 29, 0.3))',
                animation: 'float 3s ease-in-out infinite',
              }}
            />
          </div>
        </div>

        {/* Loading Text */}
        <div className="text-center space-y-3">
          <h2 className={`font-bold text-white ${config.title} tracking-tight`}>
            Panda Patches
          </h2>
          <p className="text-slate-400 text-sm md:text-base font-medium min-h-6">
            {displayMessage}
          </p>

          {/* Loading dots animation */}
          <div className="flex items-center justify-center gap-1 pt-2">
            <div
              className="w-2 h-2 bg-brand-orange rounded-full"
              style={{ animation: 'pulse 1.4s infinite' }}
            />
            <div
              className="w-2 h-2 bg-brand-orange rounded-full"
              style={{ animation: 'pulse 1.4s infinite', animationDelay: '0.2s' }}
            />
            <div
              className="w-2 h-2 bg-brand-orange rounded-full"
              style={{ animation: 'pulse 1.4s infinite', animationDelay: '0.4s' }}
            />
          </div>
        </div>
      </div>

      {/* Custom animations */}
      <style>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.4;
            transform: scale(0.8);
          }
        }
      `}</style>
    </div>
  );
};

export default LoadingScreen;
