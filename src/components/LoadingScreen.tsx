// src/components/LoadingScreen.tsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { logger } from '../services/logger';

const LoadingScreen: React.FC = () => {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchLogo = async () => {
      try {
        // Fetch logo from settings table
        const { data, error } = await supabase
          .from('settings')
          .select('logo_url')
          .eq('id', 'global_settings')
          .single();

        if (error) {
          logger.error('❌ Error fetching logo:', error);
          setIsLoading(false);
          return;
        }

        if (data?.logo_url) {
          console.log('✅ Logo URL found:', data.logo_url);
          setLogoUrl(data.logo_url);
        } else {
          console.warn('⚠️ No logo URL in settings');
        }
      } catch (err) {
        logger.error('❌ Failed to load logo:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLogo();
  }, []);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center z-50">
      <div className="text-center">
        {/* Logo Container */}
        <div className="mb-8 flex justify-center">
          {isLoading ? (
            // Loading placeholder
            <div className="w-32 h-32 bg-slate-800 rounded-2xl animate-pulse" />
          ) : logoUrl ? (
            // Loaded logo
            <img 
              src={logoUrl} 
              alt="Company Logo" 
              className="w-32 h-32 object-contain drop-shadow-2xl"
              onError={(e) => {
                logger.error('❌ Logo failed to load');
                e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24"%3E%3Cpath fill="%2310b981" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/%3E%3C/svg%3E';
              }}
            />
          ) : (
            // Fallback icon if no logo is set
            <div className="w-32 h-32 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center shadow-2xl">
              <svg className="w-20 h-20 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          )}
        </div>

        {/* Loading Text */}
        <div className="space-y-4">
          <h1 className="text-3xl font-bold text-white">Loading CRM...</h1>
          
          {/* Animated Progress Bar */}
          <div className="w-64 h-2 bg-slate-800 rounded-full overflow-hidden mx-auto">
            <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full animate-[loading_1.5s_ease-in-out_infinite]" 
                 style={{ width: '100%' }} 
            />
          </div>

          <p className="text-slate-400 text-sm">Preparing your workspace...</p>
        </div>
      </div>

      {/* CSS Animation */}
      <style>{`
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
};

export default LoadingScreen;