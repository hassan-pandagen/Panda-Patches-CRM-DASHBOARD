import React from 'react';
import { useAuth } from '../../contexts/AuthContext';

const AppLoader: React.FC = () => {
  const { settings } = useAuth();
  const logoUrl = settings?.logo_url || null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-900">
      <div className="relative flex items-center justify-center">
        {/* Subtle background pulse */}
        <div className="absolute -inset-4 bg-brand-orange/20 rounded-full blur-2xl animate-pulse" style={{ animationDuration: '3s' }}></div>
        
        {/* Logo from Supabase or fallback */}
        {logoUrl ? (
          <img 
            src={logoUrl} 
            alt="Panda Patches Logo" 
            className="w-24 h-24 animate-bounce object-contain"
            style={{ animationDuration: '2s' }}
          />
        ) : (
          <div className="flex flex-col items-center animate-bounce" style={{ animationDuration: '2s' }}>
            <div className="text-5xl font-bold text-white mb-1">🐼</div>
            <div className="text-xs text-brand-orange font-bold tracking-widest">PANDA</div>
          </div>
        )}
      </div>
      <p className="mt-6 text-lg font-medium text-slate-400 tracking-wider">Loading CRM...</p>
    </div>
  );
};

export default AppLoader;