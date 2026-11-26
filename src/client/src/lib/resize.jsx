import { useCallback, useRef, useState } from 'react';

const read = (key, fallback, min, max) => {
  try {
    const n = Number(localStorage.getItem(key));
    return n ? Math.min(max, Math.max(min, n)) : fallback;
  } catch { return fallback; }
};

/**
 * A width the student can drag (sidebars). Remembered on this device.
 * Returns the width and the props for the drag handle.
 */
export function useResizable(key, { initial, min, max }) {
  const [width, setWidth] = useState(() => read(key, initial, min, max));
  const [dragging, setDragging] = useState(false);
  const start = useRef(null);

  const save = useCallback((w) => {
    const clamped = Math.round(Math.min(max, Math.max(min, w)));
    setWidth(clamped);
    try { localStorage.setItem(key, String(clamped)); } catch { /* private mode */ }
    return clamped;
  }, [key, min, max]);

  const rtl = () => document.documentElement.dir === 'rtl';
  const handleProps = {
    role: 'separator',
    'aria-orientation': 'vertical',
    'aria-valuenow': width,
    'aria-valuemin': min,
    'aria-valuemax': max,
    tabIndex: 0,
    title: 'Drag to resize · double-click to reset',
    onPointerDown: (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      start.current = { x: e.clientX, w: width };
      setDragging(true);
      document.documentElement.classList.add('resizing');
    },
    onPointerMove: (e) => {
      if (!start.current) return;
      const dx = (e.clientX - start.current.x) * (rtl() ? -1 : 1);
      save(start.current.w + dx);
    },
    onPointerUp: () => {
      start.current = null;
      setDragging(false);
      document.documentElement.classList.remove('resizing');
    },
    onDoubleClick: () => save(initial),
    onKeyDown: (e) => {
      const step = e.shiftKey ? 40 : 10;
      const sign = rtl() ? -1 : 1;
      if (e.key === 'ArrowLeft') { e.preventDefault(); save(width - step * sign); }
      if (e.key === 'ArrowRight') { e.preventDefault(); save(width + step * sign); }
      if (e.key === 'Home' || e.key === 'Enter') { e.preventDefault(); save(initial); }
    },
  };
  handleProps.onPointerCancel = handleProps.onPointerUp;
  return { width, dragging, handleProps, reset: () => save(initial) };
}
