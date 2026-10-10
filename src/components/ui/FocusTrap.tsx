'use client';

/**
 * FocusTrap
 * Keeps keyboard focus inside the wrapped element while it is mounted.
 * Used for modals, drawers, and dialogs to meet WCAG 2.1 § 2.1.2.
 *
 * Usage:
 *   <FocusTrap onEscape={() => setOpen(false)}>
 *     <div className="modal-panel">...</div>
 *   </FocusTrap>
 */

import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),' +
  'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

interface FocusTrapProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  /** Called when the user presses Escape */
  onEscape?: () => void;
}

export function FocusTrap({ children, onEscape, className, ...rest }: FocusTrapProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Save previously focused element so we can restore it on unmount
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Focus the first focusable element inside the trap
    const firstFocusable = el.querySelector<HTMLElement>(FOCUSABLE);
    firstFocusable?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onEscape?.();
        return;
      }

      if (e.key !== 'Tab') return;

      const focusable = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (node) => !node.closest('[hidden]') && getComputedStyle(node).display !== 'none'
      );
      if (focusable.length === 0) { e.preventDefault(); return; }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        // Shift+Tab: wrap from first → last
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: wrap from last → first
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus to the trigger element on unmount
      previouslyFocused?.focus?.();
    };
  }, [onEscape]);

  return (
    <div ref={ref} className={className} {...rest}>
      {children}
    </div>
  );
}
