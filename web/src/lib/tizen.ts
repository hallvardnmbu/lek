declare global {
  interface Window {
    tizen?: {
      tvinputdevice?: {
        registerKey(key: string): void;
      };
      application?: {
        getCurrentApplication(): { exit(): void };
      };
      power?: {
        request(resource: string, state: string): void;
      };
    };
  }
}

export function initTizenTv(): void {
  try {
    window.tizen?.tvinputdevice?.registerKey('Return');
    window.tizen?.power?.request('SCREEN', 'SCREEN_NORMAL');
  } catch {
    // Ignore outside Tizen environment
  }
}

export function reloadApp(): void {
  window.location.reload();
}

export function exitTizenApp(fallbackPath = '/'): void {
  if (window.tizen?.application) {
    window.tizen.application.getCurrentApplication().exit();
  } else if (window.parent && window.parent !== window) {
    // When hosted inside the Tizen wrapper iframe, ask the parent widget to exit
    window.parent.postMessage({ type: 'tizen-exit' }, '*');
  } else {
    window.history.pushState({}, '', fallbackPath);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}

export function isTizenReturnKey(e: KeyboardEvent): boolean {
  return e.keyCode === 10009 || e.key === 'Escape' || e.keyCode === 27;
}
