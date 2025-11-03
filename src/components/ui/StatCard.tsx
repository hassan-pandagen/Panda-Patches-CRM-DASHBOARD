import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: { value: number; isPositive: boolean };
  color?: 'primary' | 'success' | 'warning' | 'error' | 'info';
}

const StatCard: React.FC<StatCardProps> = ({ title, value, subtitle, icon, trend, color = 'primary' }) => {
  const colorClasses = {
    primary: 'from-blue-500/10 to-indigo-600/10 border-blue-500/20',
    success: 'from-emerald-500/10 to-green-600/10 border-emerald-500/20',
    warning: 'from-amber-500/10 to-orange-600/10 border-amber-500/20',
    error: 'from-red-500/10 to-rose-600/10 border-red-500/20',
    info: 'from-cyan-500/10 to-blue-600/10 border-cyan-500/20'
  };

  const iconColors = {
    primary: 'text-blue-400',
    success: 'text-emerald-400',
    warning: 'text-amber-400',
    error: 'text-red-400',
    info: 'text-cyan-400'
  };

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} border rounded-xl p-5 backdrop-blur-sm`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-slate-400 text-sm font-medium mb-2">{title}</p>
          <p className="text-2xl font-bold text-white mb-1">{value}</p>
          {subtitle && <p className="text-slate-400 text-sm">{subtitle}</p>}
        </div>
        {icon && <div className={`p-3 rounded-lg bg-white/5 ${iconColors[color]}`}>{icon}</div>}
      </div>
    </div>
  );
};

export default StatCard;