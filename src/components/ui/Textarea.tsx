import React, { useState, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle } from 'lucide-react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  success?: boolean;
  maxLength?: number;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
   (
     {
       label,
       error,
       success,
       maxLength,
       value,
       className,
       ...props
     },
     ref
   ) => {
     const id = React.useId();
     const hasValue = !!value;
     const isError = !!error;
     const isSuccess = success && !isError;

     const [isFocused, setIsFocused] = React.useState(false);

    const labelVariants = {
      inactive: {
        y: 0,
        scale: 1,
        color: '#94a3b8', // slate-400
      },
      active: {
        y: -24,
        scale: 0.85,
        color: '#fb6e1d', // brand-orange
      },
    };

    const containerShake = {
      shake: {
        x: [0, -8, 8, -4, 4, 0],
        transition: { duration: 0.4, type: 'spring' as const, stiffness: 500, damping: 15 },
      },
    };

    const borderColor = isError
      ? 'border-red-500'
      : isSuccess
      ? 'border-brand-green'
      : isFocused
      ? 'border-brand-orange'
      : 'border-slate-700';

    return (
      <motion.div
        className={`relative ${className}`}
        variants={containerShake}
        animate={isError ? 'shake' : ''}
      >
        <div
          className={`
            absolute inset-0 rounded-lg border-2 transition-colors duration-300
            ${borderColor}
            ${isFocused ? 'shadow-[0_0_15px_rgba(251,110,29,0.4)]' : ''}
          `}
        ></div>

        <div className="relative bg-slate-900/40 backdrop-blur-sm rounded-lg pt-6 px-4 pb-2">
          <textarea
            ref={ref}
            id={id}
            value={value}
            maxLength={maxLength}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className="w-full bg-transparent text-white outline-none placeholder-transparent resize-none"
            placeholder={label}
            rows={4}
            {...props}
          />
          <motion.label
            htmlFor={id}
            className="absolute left-4 top-3 cursor-text origin-left pointer-events-none"
            variants={labelVariants}
            animate={isFocused || hasValue ? 'active' : 'inactive'}
            transition={{ duration: 0.2 }}
          >
            {label}
          </motion.label>
        </div>

        <div className="mt-1.5 flex justify-between items-center">
          {isError ? (
            <motion.p className="flex items-center gap-1 text-sm text-red-500">
              <AlertCircle size={14} /> {error}
            </motion.p>
          ) : <div />}
          {maxLength && <span className="text-xs text-slate-500">{String(value).length}/{maxLength}</span>}
        </div>
      </motion.div>
    );
  }
);

Textarea.displayName = 'Textarea';

export default Textarea;