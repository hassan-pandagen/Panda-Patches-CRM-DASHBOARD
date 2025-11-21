import React from 'react';
import { motion } from 'framer-motion';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
}

const EmptyState: React.FC<EmptyStateProps> = ({ title, description, action }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center text-center py-16 px-4 bg-slate-900/40 border border-white/5 rounded-2xl"
    >
      {/* CUSTOM SVG ILLUSTRATION: "The Empty Box" */}
      <div className="relative w-48 h-48 mb-6">
        <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-2xl">
          {/* Glow Effect */}
          <circle cx="100" cy="100" r="60" fill="#FB6E1D" fillOpacity="0.05" className="animate-pulse" />
          
          {/* Box Back */}
          <path d="M60 90L100 70L140 90V140L100 160L60 140V90Z" fill="#1E293B" stroke="#334155" strokeWidth="2"/>
          
          {/* Box Flaps (Open) */}
          <path d="M60 90L40 70L80 50L100 70L60 90Z" fill="#334155" fillOpacity="0.5"/>
          <path d="M140 90L160 70L120 50L100 70L140 90Z" fill="#334155" fillOpacity="0.5"/>
          
          {/* Box Front (Translucent Glass look) */}
          <path d="M60 90L100 110L140 90V140L100 160L60 140V90Z" fill="url(#paint0_linear)" stroke="#475569" strokeWidth="1"/>
          
          {/* Floating "Dust" Particles */}
          <circle cx="100" cy="60" r="2" fill="#FB6E1D" className="animate-bounce" style={{ animationDuration: '3s' }} />
          <circle cx="130" cy="80" r="1.5" fill="#94A3B8" className="animate-bounce" style={{ animationDuration: '4s', animationDelay: '1s' }} />
          <circle cx="70" cy="80" r="1.5" fill="#94A3B8" className="animate-bounce" style={{ animationDuration: '5s', animationDelay: '0.5s' }} />

          {/* Magnifying Glass (Searching) */}
          <g transform="translate(110, 110) rotate(-15)">
             <circle cx="0" cy="0" r="20" stroke="#FB6E1D" strokeWidth="3" fill="rgba(251, 110, 29, 0.1)"/>
             <path d="M14 14L28 28" stroke="#FB6E1D" strokeWidth="3" strokeLinecap="round"/>
          </g>

          <defs>
            <linearGradient id="paint0_linear" x1="100" y1="90" x2="100" y2="160" gradientUnits="userSpaceOnUse">
              <stop stopColor="#334155" stopOpacity="0.4"/>
              <stop offset="1" stopColor="#1E293B" stopOpacity="0.8"/>
            </linearGradient>
          </defs>
        </svg>
      </div>

      <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
      <p className="text-slate-400 max-w-md mx-auto mb-6 text-sm leading-relaxed">
        {description}
      </p>
      
      {action && (
        <div className="mt-2">
          {action}
        </div>
      )}
    </motion.div>
  );
};

export default EmptyState;