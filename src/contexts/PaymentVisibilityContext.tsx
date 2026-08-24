// src/contexts/PaymentVisibilityContext.tsx
import React, { createContext, useContext, useState, useCallback } from 'react';

interface PaymentVisibilityContextType {
  visible: boolean;
  toggle: () => void;
}

const PaymentVisibilityContext = createContext<PaymentVisibilityContextType | undefined>(undefined);

// Global "shoulder-surf" guard: payment amounts render masked everywhere until
// toggled on. Defaults to hidden and is session-only (resets on page reload)
// so it can't be left revealed by accident across days.
export const PaymentVisibilityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [visible, setVisible] = useState(false);
  const toggle = useCallback(() => setVisible((v) => !v), []);

  return (
    <PaymentVisibilityContext.Provider value={{ visible, toggle }}>
      {children}
    </PaymentVisibilityContext.Provider>
  );
};

export function usePaymentVisibility() {
  const context = useContext(PaymentVisibilityContext);
  if (context === undefined) {
    throw new Error('usePaymentVisibility must be used within a PaymentVisibilityProvider');
  }
  return context;
}
