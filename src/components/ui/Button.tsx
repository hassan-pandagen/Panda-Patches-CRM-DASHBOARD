import React, { useState, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { useRipple } from '../../hooks/useRipple'; // <--- Using your hook

const buttonVariants = cva(
  'relative inline-flex items-center justify-center overflow-hidden rounded-lg font-semibold tracking-wide transition-all duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        primary: 'bg-gradient-to-r from-brand-orange to-orange-500 text-white shadow-lg hover:shadow-orange-500/40 focus:ring-brand-orange border border-transparent',
        secondary: 'border border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:border-slate-500 focus:ring-slate-500',
        success: 'bg-emerald-600 text-white shadow-lg hover:shadow-emerald-500/40 focus:ring-emerald-500',
        danger: 'bg-red-600 text-white shadow-lg hover:shadow-red-500/40 focus:ring-red-500',
        ghost: 'text-slate-300 hover:bg-white/10 focus:ring-slate-500',
      },
      size: {
        sm: 'px-3 py-1.5 text-xs',
        md: 'px-5 py-2.5 text-sm',
        lg: 'px-6 py-3 text-base',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

type HTMLButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart'>;

export interface ButtonProps extends HTMLButtonProps, VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void | Promise<void>;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      isLoading: propsIsLoading = false,
      icon,
      iconPosition = 'left',
      fullWidth = false,
      children,
      onClick,
      ...props
    },
    ref
  ) => {
    // 1. Use the centralized hook instead of internal state
    const { ripples, addRipple } = useRipple();
    
    const [internalLoading, setInternalLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const isLoading = propsIsLoading || internalLoading;

    const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
      if (isLoading || isSuccess) return;

      // 2. Trigger the ripple via hook
      addRipple(event);

      if (onClick) {
        const result = onClick(event);

        // Auto-handle async loading states
        if (result instanceof Promise) {
          setInternalLoading(true);
          try {
            await result;
            setIsSuccess(true);
            setTimeout(() => setIsSuccess(false), 2000);
          } catch (error) {
            console.error("Button async onClick error:", error);
          } finally {
            setInternalLoading(false);
          }
        }
      }
    };

    const IconComponent = icon ? (
      <motion.div
        className="flex items-center"
        initial={false}
        animate={{
          opacity: isLoading || isSuccess ? 0 : 1,
          width: isLoading || isSuccess ? 0 : 'auto',
          marginRight: iconPosition === 'left' && children ? (size === 'sm' ? '0.25rem' : '0.5rem') : 0,
          marginLeft: iconPosition === 'right' && children ? (size === 'sm' ? '0.25rem' : '0.5rem') : 0,
        }}
      >
        {icon}
      </motion.div>
    ) : null;

    return (
      <motion.button
        ref={ref}
        className={buttonVariants({ variant, size, className: `${className} ${fullWidth ? 'w-full' : ''}` })}
        disabled={isLoading || props.disabled}
        onClick={handleClick}
        whileTap={{ scale: isLoading || props.disabled ? 1 : 0.98 }}
        {...props}
      >
        {/* 3. Render Ripples using the Hook logic */}
        <span className="pointer-events-none absolute inset-0 overflow-hidden">
          {ripples.map((ripple) => (
            <span
              key={ripple.id}
              className="absolute bg-white/30 rounded-full animate-ripple"
              style={{
                left: ripple.x,
                top: ripple.y,
                width: ripple.size,
                height: ripple.size,
                transform: 'scale(0)',
              }}
            />
          ))}
        </span>

        {/* Content / Loading / Success States */}
        <AnimatePresence mode="wait" initial={false}>
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
            </motion.div>
          ) : isSuccess ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <motion.svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                <motion.path
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </motion.svg>
            </motion.div>
          ) : (
            <motion.div
              key="content"
              className="flex items-center justify-center"
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
            >
              {iconPosition === 'left' && IconComponent}
              {children}
              {iconPosition === 'right' && IconComponent}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    );
  }
);

Button.displayName = 'Button';

export default Button;