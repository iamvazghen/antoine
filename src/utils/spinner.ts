/**
 * Shared spinner for all animated components.
 *
 * One setInterval drives ALL spinners in the app. Subscribers receive
 * the current frame character on each tick. Crucially, we trigger exactly
 * one requestRender() per VISIBLE frame change — not per internal tick.
 *
 * Why this matters: pi-tui re-renders the entire component tree (intro +
 * full chat log) on every requestRender. During a long research run the
 * chat log can be thousands of lines, so a 20fps render loop both burns CPU
 * and fights the terminal's native scrollback (every repaint yanks the
 * viewport back to the bottom, making it impossible to scroll up smoothly).
 * An ~8fps cadence keeps the spinner lively while leaving the terminal free
 * to scroll between frames.
 */

import type { TUI } from '@mariozechner/pi-tui';

// ~8 fps. Calm enough to not fight terminal scroll, fast enough to read as motion.
export const SPINNER_INTERVAL_MS = 120;
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

type SpinnerSubscriber = (frame: string) => void;

let interval: ReturnType<typeof setInterval> | null = null;
let frameIndex = 0;
const subscribers = new Set<SpinnerSubscriber>();
let tuiInstance: TUI | null = null;

/**
 * Initialize with the TUI instance (call once at startup).
 */
export function initSpinner(tui: TUI): void {
  tuiInstance = tui;
}

/**
 * Subscribe to spinner frame updates. Returns an unsubscribe function.
 * The interval starts on first subscriber and stops when the last unsubscribes.
 */
export function subscribeSpinner(cb: SpinnerSubscriber): () => void {
  subscribers.add(cb);

  if (!interval) {
    interval = setInterval(() => {
      frameIndex = (frameIndex + 1) % SPINNER_FRAMES.length;
      const frame = SPINNER_FRAMES[frameIndex];
      for (const sub of subscribers) {
        sub(frame);
      }
      // One render per visible frame change — keeps scroll responsive.
      tuiInstance?.requestRender();
    }, SPINNER_INTERVAL_MS);
  }

  return () => {
    subscribers.delete(cb);
    if (subscribers.size === 0 && interval) {
      clearInterval(interval);
      interval = null;
    }
  };
}

/**
 * Get the current spinner frame (for initial render before first tick).
 */
export function currentSpinnerFrame(): string {
  return SPINNER_FRAMES[frameIndex];
}
