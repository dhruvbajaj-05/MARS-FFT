import { useEffect, useRef } from 'react';

// Lightweight animation helpers built on the browser's native Web Animations API — no external
// dependency, no install. Keeps the animation vocabulary consistent across the console.

// Shared easing token (smooth, slightly springy ease-out) so every motion feels like one system.
export const EASE = 'cubic-bezier(.22,1,.36,1)';

// Fade + slide an element up. Returns the Animation so callers can cancel/await it.
export function playFadeUp(
  el: Element,
  opts?: { y?: number; x?: number; duration?: number; delay?: number },
) {
  const y = opts?.y ?? 12;
  const x = opts?.x ?? 0;
  return el.animate(
    [
      { opacity: 0, transform: `translate(${x}px, ${y}px)` },
      { opacity: 1, transform: 'translate(0, 0)' },
    ],
    { duration: opts?.duration ?? 560, delay: opts?.delay ?? 0, easing: EASE, fill: 'both' },
  );
}

// Animate a number from 0 → `value`, formatting each frame via requestAnimationFrame. Attach
// the returned ref to the element whose textContent should count up. Re-runs when `value` changes.
export function useCountUp<T extends HTMLElement = HTMLDivElement>(
  value: number,
  opts?: { duration?: number; format?: (n: number) => string },
) {
  const ref = useRef<T | null>(null);
  const format = opts?.format ?? ((n: number) => Math.round(n).toLocaleString());
  const duration = opts?.duration ?? 1100;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let start = 0;
    // ease-out cubic
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const step = (ts: number) => {
      if (!start) start = ts;
      const t = Math.min(1, (ts - start) / duration);
      el.textContent = format(value * ease(t));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, format]);

  return ref;
}

// Staggered entrance for a group of children. Attach the returned ref to a container; every
// element matching `selector` fades/slides up in sequence. Re-runs when `deps` change — perfect
// for lists that arrive after a data fetch.
export function useStaggerIn(selector: string, deps: unknown[] = [], opts?: { delay?: number; y?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const stagger = opts?.delay ?? 60;
  const y = opts?.y ?? 14;

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll(selector));
    const anims = els.map((el, i) => playFadeUp(el, { y, delay: i * stagger, duration: 620 }));
    return () => anims.forEach((a) => a.cancel());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}

// Animate a horizontal bar fill to a percentage. Attach ref to the fill element; its width
// animates from 0 → pct% whenever pct changes.
export function useBarFill(pct: number, opts?: { duration?: number; delay?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = `${Math.max(0, Math.min(100, pct))}%`;
    const anim = el.animate([{ width: '0%' }, { width: target }], {
      duration: opts?.duration ?? 900,
      delay: opts?.delay ?? 120,
      easing: EASE,
      fill: 'both',
    });
    return () => anim.cancel();
  }, [pct, opts?.duration, opts?.delay]);
  return ref;
}

// A quick tactile press animation for any button/element. Call in an onClick handler.
export function pressPop(el: HTMLElement | null) {
  if (!el) return;
  el.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(0.94)' }, { transform: 'scale(1)' }],
    { duration: 320, easing: EASE },
  );
}
