/**
 * Loading indicator DOM helpers.
 *
 * One small panel with three roles:
 *  - show(): unhide and set progress message
 *  - hide(): remove from DOM entirely
 *  - setText(): swap message while visible
 *
 * Kept purposefully framework-free; the element is created and appended once
 * per page lifecycle.
 */

export interface LoadingController {
  setText(message: string): void;
  hide(): void;
}

export function createLoading(root: HTMLElement): LoadingController {
  const panel = document.createElement('div');
  panel.className = 'loading';
  panel.setAttribute('role', 'status');
  panel.setAttribute('aria-live', 'polite');
  panel.textContent = 'Loading the historical globe…';
  root.append(panel);

  return {
    setText(message) {
      panel.textContent = message;
    },
    hide() {
      panel.remove();
    },
  };
}
