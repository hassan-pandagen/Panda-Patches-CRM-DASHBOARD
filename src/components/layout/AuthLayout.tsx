import React from 'react';
import PandaIcon from '../ui/PandaIcon';

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ title, subtitle, children }) => (
  <div className="flex items-center justify-center min-h-screen bg-slate-900">
    <div className="w-full max-w-md p-8 space-y-6 bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl shadow-lg shadow-black/10">
      <div className="flex flex-col items-center">
        <PandaIcon />
        <h2 className="text-2xl font-semibold tracking-wide text-center text-slate-100">{title}</h2>
        <p className="text-slate-400">{subtitle}</p>
      </div>
      {children}
    </div>
  </div>
);

export default AuthLayout;