import { onCleanup, onMount } from 'solid-js';
import { isTizenReturnKey } from './tizen';

const FOCUSABLE_SELECTOR = 'button:not(:disabled), [data-dpad]:not([disabled])';

export interface DpadNavOptions {
  onReturn?: () => void;
}

/**
 * Attaches Tizen/keyboard D-pad navigation to a container element.
 * Automatically discovers enabled buttons inside the active scope
 * (trapping focus inside `.modal-backdrop` when a modal is open).
 */
export function createDpadNav(
  getContainer: () => HTMLElement | undefined,
  options: DpadNavOptions = {}
): void {
  let activeEl: HTMLElement | null = null;

  const getFocusables = (): HTMLElement[] => {
    const root = getContainer();
    if (!root) return [];
    const modal = root.querySelector<HTMLElement>('.modal-backdrop');
    const scope = modal ?? root;
    return Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  };

  const applyFocus = (next: HTMLElement | null) => {
    if (activeEl && activeEl !== next) {
      activeEl.classList.remove('dpad-focused');
    }
    activeEl = next;
    if (activeEl) {
      activeEl.classList.add('dpad-focused');
    }
  };

  const syncFocus = () => {
    const items = getFocusables();
    if (items.length === 0) {
      applyFocus(null);
      return;
    }
    if (!activeEl || !items.includes(activeEl)) {
      applyFocus(items[0]);
    }
  };

  onMount(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTizenReturnKey(e)) {
        e.preventDefault();
        options.onReturn?.();
        queueMicrotask(syncFocus);
        return;
      }

      const items = getFocusables();
      if (items.length === 0) return;

      const currentIdx = activeEl ? items.indexOf(activeEl) : -1;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % items.length;
        applyFocus(items[nextIdx]);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIdx =
          currentIdx < 0 ? items.length - 1 : (currentIdx - 1 + items.length) % items.length;
        applyFocus(items[prevIdx]);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const target = currentIdx >= 0 ? items[currentIdx] : items[0];
        target?.click();
      }
    };

    const observer = new MutationObserver(() => {
      syncFocus();
    });

    const container = getContainer();
    if (container) {
      observer.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['disabled', 'class'],
      });
    }

    syncFocus();
    window.addEventListener('keydown', onKeyDown);

    onCleanup(() => {
      observer.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      applyFocus(null);
    });
  });
}
