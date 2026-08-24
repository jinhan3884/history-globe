/**
 * Hover tooltip. Tracks the mouse; shows a feature display name when one is
 * available, hides otherwise. Position is controlled by `moveTo` so the
 * Cesium interaction handler does not need direct access to the DOM node.
 */

export interface TooltipController {
  show(name: string): void;
  moveTo(x: number, y: number): void;
  hide(): void;
}

export function createTooltip(root: HTMLElement): TooltipController {
  const el = document.createElement('div');
  el.className = 'tooltip';
  el.setAttribute('role', 'tooltip');
  el.setAttribute('aria-live', 'polite');
  el.hidden = true;
  root.append(el);

  return {
    show(name) {
      el.textContent = name;
      el.hidden = false;
    },
    moveTo(x, y) {
      const parent = el.parentElement;
      if (parent) {
        parent.style.setProperty('--tooltip-x', `${x}px`);
        parent.style.setProperty('--tooltip-y', `${y}px`);
      }
    },
    hide() {
      el.hidden = true;
    },
  };
}
