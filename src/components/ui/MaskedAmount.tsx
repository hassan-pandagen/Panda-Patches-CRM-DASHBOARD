// src/components/ui/MaskedAmount.tsx
import React from 'react';
import { usePaymentVisibility } from '../../contexts/PaymentVisibilityContext';

interface MaskedAmountProps {
  value: number;
  prefix?: string;
  className?: string;
}

// Renders a dollar amount, or a masked placeholder when the global
// payment-visibility toggle (the header eye icon) is off.
const MaskedAmount: React.FC<MaskedAmountProps> = ({ value, prefix = '$', className = '' }) => {
  const { visible } = usePaymentVisibility();

  if (!visible) {
    return (
      <span className={`select-none tracking-widest ${className}`} aria-label="Amount hidden">
        ••••••
      </span>
    );
  }

  return <span className={className}>{prefix}{value.toLocaleString()}</span>;
};

export default MaskedAmount;
