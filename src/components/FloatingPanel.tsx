'use client';
// src/components/FloatingPanel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// A drop-down that is NEVER clipped.
//
// The suggestion lists (bill screen item search, technician recipe search, the
// technician picker) used to be positioned with `position:absolute` inside their
// card. Any ancestor with `overflow:hidden` / `overflow:auto` — the recipe card,
// the table wrapper, the rounded panel — then cut the list off, so the cashier
// saw one or two rows and the rest was gone.
//
// This component renders the list in a portal on <body> with `position:fixed`
// coordinates taken from the anchor element, so no ancestor can clip it:
//
//   · it always sits directly under the input (same width),
//   · it flips above the input when there is not enough room below,
//   · it clips its own height to the space actually available and scrolls,
//   · it follows the input when the page or an inner panel is scrolled.
// ─────────────────────────────────────────────────────────────────────────────
import React, {
  useCallback,
  useEffect,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

interface FloatingPanelProps {
  /** The element to hang under (usually the wrapper around the input). */
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  children: React.ReactNode;
  /** Styling class (background, border, radius, shadow …). */
  className?: string;
  /** Height the panel would like to have; used to decide flipping. */
  preferredHeight?: number;
  /** Gap between the anchor and the panel. */
  gap?: number;
}

export default function FloatingPanel({
  anchorRef,
  open,
  children,
  className,
  preferredHeight = 240,
  gap = 4,
}: FloatingPanelProps) {
  const [style, setStyle] = useState<React.CSSProperties | null>(null);

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - gap - 8;
    const spaceAbove = rect.top - gap - 8;
    const flip =
      spaceBelow < Math.min(preferredHeight, 170) && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(preferredHeight, flip ? spaceAbove : spaceBelow));

    setStyle({
      position: 'fixed',
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      top: flip ? undefined : Math.round(rect.bottom + gap),
      bottom: flip ? Math.round(window.innerHeight - rect.top + gap) : undefined,
      maxHeight: Math.round(maxHeight),
      zIndex: 3000,
    });
  }, [anchorRef, gap, preferredHeight]);

  useEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }
    place();
    const handler = () => place();
    // capture: true — catches scrolling inside the panels too, not just <body>.
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    // The layout can settle a frame or two after the list appears (fonts,
    // images, the card animating in), so measure again shortly after.
    const first = window.setTimeout(place, 30);
    const second = window.setTimeout(place, 160);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
      window.clearTimeout(first);
      window.clearTimeout(second);
    };
  }, [open, place]);

  if (!open || !style || typeof document === 'undefined') return null;

  return createPortal(
    <div className={className} style={style}>
      {children}
    </div>,
    document.body,
  );
}
