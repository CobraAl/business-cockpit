import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/**
 * Floating panel anchored under (or above, when there is no room) a trigger element.
 * Rendered in <body> so modals and scroll containers never clip it.
 */
export function Popover({ anchor, open, onClose, children, minWidth = 200, panelRef, label }: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  minWidth?: number;
  panelRef: RefObject<HTMLDivElement | null>;
  label?: string;
}) {
  // Off-screen but still focusable until measured (visibility:hidden would block focus()).
  const [style, setStyle] = useState<CSSProperties>({ position: 'fixed', top: -9999, left: -9999, opacity: 0 });
  // Side chosen when the panel opened; kept while it stays open so it doesn't jump around.
  const side = useRef<'up' | 'down' | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    side.current = null;
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const panel = panelRef.current;
      if (!a || !panel) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) / 16;
      const width = Math.min(Math.max(a.width, minWidth * rem), vw - 16);
      // Natural height (not the capped one), so a calendar is never cut when it doesn't fit below.
      const h = panel.scrollHeight;
      const below = vh - a.bottom - 8;
      const above = a.top - 8;
      const fits = (s: 'up' | 'down') => h <= (s === 'up' ? above : below);
      // First placement: below unless it doesn't fit and above has more room. Later: keep the
      // side, unless the content no longer fits there while the other side has room.
      if (!side.current) side.current = !fits('down') && above > below ? 'up' : 'down';
      else if (!fits(side.current)) {
        const other = side.current === 'up' ? 'down' : 'up';
        if (fits(other)) side.current = other;
      }
      const up = side.current === 'up';
      const left = Math.min(Math.max(8, a.left), vw - width - 8);
      setStyle({
        position: 'fixed',
        left,
        width,
        ...(up ? { bottom: vh - a.top + 6 } : { top: a.bottom + 6 }),
        maxHeight: Math.max(160, (up ? a.top : vh - a.bottom) - 16),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    // Content can change size while open (calendar days <-> months): place it again.
    const ro = typeof ResizeObserver !== 'undefined' && panelRef.current ? new ResizeObserver(place) : null;
    if (ro && panelRef.current) ro.observe(panelRef.current.firstElementChild ?? panelRef.current);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      ro?.disconnect();
    };
  }, [open, anchor, panelRef, minWidth]);

  // Escape and Tab always act on the open panel first, wherever focus is (never the modal behind).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        anchor.current?.focus();
      } else if (e.key === 'Tab' && panelRef.current?.contains(document.activeElement)) {
        // Back on the trigger, then the browser's Tab moves on to the next field.
        onClose();
        anchor.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose, anchor, panelRef]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      // The field's caption (the <label> around the trigger) toggles the trigger itself.
      const caption = anchor.current?.closest('label');
      if (panelRef.current?.contains(t) || anchor.current?.contains(t) || caption?.contains(t)) return;
      onClose();
      // The press that closes the panel must not also press whatever is under it (like a native menu).
      const eat = (ev: Event) => {
        ev.preventDefault();
        ev.stopPropagation();
      };
      document.addEventListener('click', eat, { capture: true, once: true });
      // Disarm when this press ends (plus a moment for its click), however long it was held.
      const disarm = () => {
        window.setTimeout(() => document.removeEventListener('click', eat, true), 300);
        document.removeEventListener('pointerup', disarm, true);
        document.removeEventListener('pointercancel', disarm, true);
      };
      document.addEventListener('pointerup', disarm, true);
      document.addEventListener('pointercancel', disarm, true);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open, onClose, anchor, panelRef]);

  if (!open) return null;
  return createPortal(
    <div
      ref={panelRef}
      className="pop"
      style={style}
      role="dialog"
      aria-label={label}
      // Clicks on padding or gaps must not pull focus out of the panel (keyboard and Escape live there).
      onMouseDown={(e) => {
        if (!(e.target as Element).closest('input, textarea')) e.preventDefault();
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
