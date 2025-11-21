import React, { useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

const AnimatedCounter: React.FC<{ value: number; prefix?: string }> = ({ value, prefix = '' }) => {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => `${prefix}${Math.round(latest).toLocaleString()}`);

  useEffect(() => {
    const controls = animate(count, value, { duration: 1.5, ease: "easeOut" });
    return controls.stop;
  }, [value]);

  return <motion.span>{rounded}</motion.span>;
};
interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  prefix?: string;
  isLoading?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  trend,
  prefix = '',
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="h-[140px] w-full animate-pulse rounded-2xl bg-slate-800/60 p-5">
        <div className="h-6 w-3/4 rounded-md bg-slate-700/50"></div>
        <div className="mt-4 h-10 w-1/2 rounded-md bg-slate-700/50"></div>
        <div className="mt-2 h-4 w-1/4 rounded-md bg-slate-700/50"></div>
      </div>
    );
  }

  const trendColor = trend?.isPositive ? 'text-brand-green' : 'text-red-500';
  const TrendIcon = trend?.isPositive ? ArrowUpRight : ArrowDownRight;

  return (
    <motion.div
      whileHover={{ y: -8, scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="group relative overflow-hidden rounded-2xl bg-slate-800/40 p-5 backdrop-blur-lg shadow-lg"
    >
      <div className="absolute inset-0 z-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
        <div className="absolute inset-0 bg-gradient-to-r from-brand-orange to-purple-500 blur-md"></div>
      </div>

      <div className="relative z-10 flex flex-col justify-between h-full">
        <div className="flex items-center justify-between text-slate-400">
          <h3 className="font-medium">{title}</h3>
          <motion.div
            className="text-slate-500 transition-colors duration-300 group-hover:text-brand-orange"
            initial={{ rotate: 0 }}
            whileHover={{ rotate: 15, scale: 1.2 }}
          >
            {icon}
          </motion.div>
        </div>

        <div>
          <h2 className="text-4xl font-bold text-white">
            <AnimatedCounter value={value} prefix={prefix} />
          </h2>
        </div>

        {trend && (
          <div className="flex items-center gap-1 text-sm">
            <span className={`flex items-center font-semibold ${trendColor}`}>
              <TrendIcon className="mr-1 h-4 w-4" />
              {trend.value.toFixed(1)}%
            </span>
            <span className="text-slate-500">vs last month</span>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default StatCard;