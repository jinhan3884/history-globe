/**
 * Visible error panel.
 *
 * The MVP requirement is that a load failure must be visible to the user, not
 * merely logged. This panel is appended as a modal-style overlay so the
 * visitor sees the message even if the Cesium canvas is empty or black.
 */

export interface ErrorController {
  show(message: string, detail?: string): void;
  hide(): void;
}

export function createErrorPanel(root: HTMLElement): ErrorController {
  const overlay = document.createElement('div');
  overlay.className = 'error-overlay';
  overlay.setAttribute('role', 'alert');
  overlay.hidden = true;

  const card = document.createElement('div');
  card.className = 'error-card';

  const title = document.createElement('h2');
  title.textContent = 'Something went wrong';

  const message = document.createElement('p');
  message.className = 'error-message';

  const detail = document.createElement('p');
  detail.className = 'error-detail';

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.textContent = 'Dismiss';
  dismiss.className = 'error-dismiss';
  dismiss.addEventListener('click', () => {
    overlay.hidden = true;
  });

  card.append(title, message, detail, dismiss);
  overlay.append(card);
  root.append(overlay);

  return {
    show(msg, det) {
      message.textContent = msg;
      // Only show the detail block when there is something useful to surface.
      if (det && det.length > 0) {
        detail.textContent = det;
        detail.hidden = false;
      } else {
        detail.hidden = true;
      }
      overlay.hidden = false;
    },
    hide() {
      overlay.hidden = true;
    },
  };
}
