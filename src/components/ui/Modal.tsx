import React, { useEffect, useRef, useCallback } from 'react';

// Shared modal shell. Gives every dialog the accessibility the app was missing:
//   - role="dialog" + aria-modal so screen readers announce it
//   - focus trap (Tab/Shift+Tab cycle inside) + return-focus on close
//   - Escape to close, backdrop click to close
//   - body scroll lock while open
// Migrate the ~11 hand-rolled `fixed inset-0` shells onto this; keep your own header/body/footer.

const SIZE = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
} as const;

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** id of the element that labels the dialog (usually the title <h2 id=…>). */
  labelledBy?: string;
  /** Fallback accessible name when there's no visible title element. */
  ariaLabel?: string;
  size?: keyof typeof SIZE;
  closeOnBackdrop?: boolean;
  /** Extra classes appended to the panel (e.g. a different bg for a print sheet). */
  className?: string;
  children: React.ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  labelledBy,
  ariaLabel,
  size = 'md',
  closeOnBackdrop = true,
  className = '',
  children,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Remember what had focus, move focus into the dialog, lock body scroll.
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = prevOverflow;
      // Return focus to whatever opened the modal.
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (nodes.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const firstEl = nodes[0];
      const lastEl = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement;
      if (e.shiftKey) {
        if (active === firstEl || !panel.contains(active)) {
          e.preventDefault();
          lastEl.focus();
        }
      } else if (active === lastEl || !panel.contains(active)) {
        e.preventDefault();
        firstEl.focus();
      }
    },
    [onClose],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : ariaLabel}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`relative w-full ${SIZE[size]} max-h-[90vh] overflow-y-auto bg-slate-900 border border-white/10 rounded-2xl shadow-2xl outline-none ${className}`}
      >
        {children}
      </div>
    </div>
  );
};

export default Modal;
