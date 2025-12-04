import React from 'react';

const AppLoader: React.FC = () => {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-900">
      <div className="relative flex items-center justify-center">
        {/* Subtle background pulse */}
        <div className="absolute -inset-4 bg-brand-orange/20 rounded-full blur-2xl animate-pulse" style={{ animationDuration: '3s' }}></div>
        
        {/* Waving Panda Logo */}
        <img 
          src="/logo.svg" 
          alt="Panda Patches Logo" 
          className="w-24 h-24 animate-wave origin-bottom-right"
        />
      </div>
      <p className="mt-6 text-lg font-medium text-slate-400 tracking-wider">Loading CRM...</p>
    </div>
  );
};

export default AppLoader;