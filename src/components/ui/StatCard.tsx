import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  color?: 'primary' | 'success' | 'warning' | 'error' | 'info';
  onClick?: () => void;
  className?: string;
}

const StatCard: React.FC<StatCardProps> = ({ 
  title, 
  value, 
  subtitle, 
  icon, 
  color = 'primary', 
  onClick,
  className = ''
}) => {
  const colorClasses = {
    primary: 'from-blue-500/10 to-indigo-600/10 border-blue-500/30',
    success: 'from-emerald-500/10 to-green-600/10 border-emerald-500/30',
    warning: 'from-amber-500/10 to-orange-600/10 border-amber-500/30',
    error: 'from-red-500/10 to-rose-600/10 border-red-500/30',
    info: 'from-cyan-500/10 to-blue-600/10 border-cyan-500/30'
  };

  const iconColors = {
    primary: 'text-blue-400',
    success: 'text-emerald-400',
    warning: 'text-amber-400',
    error: 'text-red-400',
    info: 'text-cyan-400'
  };

  const baseClasses = `bg-gradient-to-br ${colorClasses[color]} border rounded-xl p-6 backdrop-blur-sm transition-all duration-200`;
  const clickableClasses = onClick ? 'cursor-pointer hover:scale-105 hover:shadow-lg' : '';

  return (
    <div 
      className={`${baseClasses} ${clickableClasses} ${className}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-slate-400 text-sm font-medium mb-2">{title}</p>
          <p className="text-3xl font-bold text-white mb-1">{value}</p>
          {subtitle && <p className="text-slate-400 text-xs mt-1">{subtitle}</p>}
        </div>
        {icon && (
          <div className={`p-3 rounded-lg bg-white/5 ${iconColors[color]}`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
};

export default StatCard;