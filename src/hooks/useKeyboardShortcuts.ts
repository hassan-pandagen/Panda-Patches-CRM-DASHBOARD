import { useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * Global keyboard shortcuts for the CRM
 *
 * K or /        → Focus search bar
 * N             → New Order
 * Esc           → Close modals, clear search, blur inputs
 * G then D      → Go to Dashboard
 * G then O      → Go to Orders
 * G then R      → Go to Reports
 * G then Q      → Go to Quotes
 * G then S      → Go to Settings
 * ?             → Show shortcuts help (future)
 */
export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const tagName = target.tagName.toLowerCase();
    const isInput = tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable;

    // Esc always works — close modals, blur inputs, clear search
    if (e.key === 'Escape') {
      if (isInput) {
        (target as HTMLInputElement).blur();
        return;
      }
      // Close any open modal by clicking backdrop or pressing Esc
      const modal = document.querySelector('[role="dialog"]') || document.querySelector('[data-modal]');
      if (modal) {
        const closeBtn = modal.querySelector('button[aria-label="Close"]') || modal.querySelector('button:first-child');
        if (closeBtn) (closeBtn as HTMLButtonElement).click();
      }
      return;
    }

    // All other shortcuts only work when NOT typing in an input
    if (isInput) return;

    // K or / → Focus search
    if (e.key === 'k' || e.key === '/') {
      e.preventDefault();
      const searchInput = document.querySelector('input[type="text"][placeholder*="Search"]') as HTMLInputElement;
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
      return;
    }

    // N → New Order
    if (e.key === 'n' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      navigate('/new-order');
      return;
    }

    // G → Go to (wait for second key)
    if (e.key === 'g' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      const handleSecondKey = (e2: KeyboardEvent) => {
        document.removeEventListener('keydown', handleSecondKey);
        clearTimeout(timeout);

        const routes: Record<string, string> = {
          'd': '/',
          'o': '/orders',
          'r': '/reports',
          'q': '/quotes',
          's': '/settings',
          'c': '/clock-in-out',
          'n': '/new-order',
        };

        const route = routes[e2.key];
        if (route) {
          e2.preventDefault();
          navigate(route);
        }
      };

      // Cancel if no second key within 1.5s
      const timeout = setTimeout(() => {
        document.removeEventListener('keydown', handleSecondKey);
      }, 1500);

      document.addEventListener('keydown', handleSecondKey);
      return;
    }
  }, [navigate, location]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
