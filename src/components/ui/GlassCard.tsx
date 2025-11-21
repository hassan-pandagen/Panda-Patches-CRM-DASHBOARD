import React from 'react';
import { motion, MotionProps } from 'framer-motion';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  padding?: 'sm' | 'md' | 'lg' | 'xl';
  gradient?: boolean;
  onClick?: () => void;
}

const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = '',
  hover = true,
  padding = 'md',
  gradient = true,
  onClick,
}) => {
  const paddingClasses = {
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
    xl: 'p-10',
  };

  const isClickable = !!onClick;

  const motionProps: MotionProps = hover && isClickable
    ? {
        whileHover: { y: -5, scale: 1.02, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' },
        whileTap: { scale: 0.98 },
        transition: { type: 'spring', stiffness: 300, damping: 20 },
      }
    : {};

  const cardContent = (
    <div
      className={`
        w-full h-full rounded-xl
        bg-slate-900/40 backdrop-blur-xl
        border border-white/10
        ${paddingClasses[padding]}
        ${className}
      `}
    >
      {children}
    </div>
  );

  return (
    <motion.div
      {...motionProps}
      onClick={onClick}
      className={`
        relative rounded-xl transition-shadow duration-300
        ${isClickable ? 'cursor-pointer' : ''}
        ${gradient ? 'p-px' : ''}
      `}
      style={gradient ? {
        background: 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0))',
      } : {}}
    >
      {/* Gradient Glow on Hover */}
      {gradient && hover && (
        <div className="absolute -inset-px rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-brand-orange via-purple-500 to-brand-green blur-lg" />
        </div>
      )}

      {cardContent}
    </motion.div>
  );
};

export default GlassCard;