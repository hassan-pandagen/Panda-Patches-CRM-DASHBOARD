import React, {
  useState,
  useId,
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle } from 'lucide-react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  success?: boolean;
  icon?: ReactNode;
  rightIcon?: ReactNode;
  onClear?: () => void;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
   (
     {
       label,
       type = 'text',
       error,
       success,
       icon,
       rightIcon,
       maxLength,
       value,
       onClear,
       className,
       ...props
     },
     ref
   ) => {
     const id = useId();
     const hasValue = !!value;
     const isError = !!error;
     const isSuccess = success && !isError;

     const [isFocused, setIsFocused] = useState(false);

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

        <div className="relative flex items-center bg-slate-900/40 backdrop-blur-sm rounded-lg">
          {icon && <span className="pl-4 text-slate-500">{icon}</span>}

          <div className="relative grow">
            <input
              ref={ref}
              id={id}
              type={type}
              value={value}
              maxLength={maxLength}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              className={`
                w-full bg-transparent px-4 py-3 text-white outline-none
                placeholder-transparent transition-all duration-200
                ${icon ? 'pl-3' : ''}
              `}
              placeholder={label}
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

          <div className="flex items-center gap-2 pr-4">
            {maxLength && (
              <span className="text-xs text-slate-500">
                {String(value).length}/{maxLength}
              </span>
            )}
            <AnimatePresence mode="wait">
              {hasValue && onClear && (
                <motion.button
                  key="clear"
                  type="button"
                  onClick={onClear}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  className="text-slate-500 hover:text-white"
                >
                  <X size={18} />
                </motion.button>
              )}
            </AnimatePresence>
            {rightIcon}
            {isSuccess && <CheckCircle size={18} className="text-brand-green" />}
          </div>
        </div>

        <AnimatePresence>
          {isError && (
            <motion.p
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="mt-1.5 flex items-center gap-1 text-sm text-red-500"
            >
              <AlertCircle size={14} />
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }
);

Input.displayName = 'Input';
export default Input;
