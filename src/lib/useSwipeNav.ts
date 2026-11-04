import { useEffect, useRef } from 'react';

const MIN_DISTANCE = 70;
const MAX_MS = 700;
/** Leaves the screen edges to the phone's own back and forward gestures. */
const EDGE = 24;
/** Places where a sideways drag already means something else. */
const NOT_HERE = 'canvas, .worm, dialog, input, textarea, select';

function scrollsSideways(start: Element | null) {
  for (let el = start; el && el !== document.body; el = el.parentElement) {
    const { overflowX } = getComputedStyle(el);
    if ((overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) return true;
  }
  return false;
}

/**
 * Calls onSwipe(1) for a swipe left (next) and onSwipe(-1) for a swipe right
 * (previous). Touch only, so it never fires for a mouse.
 */
export function useSwipeNav(onSwipe: (direction: 1 | -1) => void) {
  const latest = useRef(onSwipe);
  latest.current = onSwipe;

  useEffect(() => {
    let start: { x: number; y: number; at: number } | null = null;

    const down = (e: TouchEvent) => {
      start = null;
      if (e.touches.length !== 1) return;
      const { clientX: x, clientY: y } = e.touches[0];
      const target = e.target as Element;
      if (x < EDGE || x > window.innerWidth - EDGE) return;
      if ((window.visualViewport?.scale ?? 1) > 1.01) return; // Zoomed in: the drag is for panning.
      if (document.querySelector('dialog[open]') || target.closest(NOT_HERE) || scrollsSideways(target)) return;
      start = { x, y, at: e.timeStamp };
    };

    const up = (e: TouchEvent) => {
      if (!start) return;
      const { clientX, clientY } = e.changedTouches[0];
      const dx = clientX - start.x;
      const dy = clientY - start.y;
      const quick = e.timeStamp - start.at < MAX_MS;
      start = null;
      if (!quick || Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 2) return;
      if (!window.getSelection()?.isCollapsed) return; // They were selecting text.
      latest.current(dx < 0 ? 1 : -1);
    };

    const cancel = () => { start = null; };
    const secondFinger = (e: TouchEvent) => { if (e.touches.length > 1) start = null; };

    document.addEventListener('touchstart', down, { passive: true });
    document.addEventListener('touchmove', secondFinger, { passive: true });
    document.addEventListener('touchend', up, { passive: true });
    document.addEventListener('touchcancel', cancel, { passive: true });
    return () => {
      document.removeEventListener('touchstart', down);
      document.removeEventListener('touchmove', secondFinger);
      document.removeEventListener('touchend', up);
      document.removeEventListener('touchcancel', cancel);
    };
  }, []);
}
