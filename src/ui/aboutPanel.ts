/**
 * About / data-source panel. A small "About" toggle button bottom-right that
 * shows/hides a panel with branding, product description, and dataset
 * attribution. Framework-free like the other ui/ controllers.
 */

export interface AboutPanelController {
  toggle(): void;
}

export function createAboutPanel(root: HTMLElement): AboutPanelController {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'about-button';
  button.textContent = 'About';
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'about-panel');

  const panel = document.createElement('div');
  panel.id = 'about-panel';
  panel.className = 'about-panel';
  panel.hidden = true;

  const title = document.createElement('h2');
  title.textContent = 'History Atlas';
  panel.append(title);

  const tagline = document.createElement('p');
  tagline.textContent =
    'History has coordinates. Explore the world in the year 100 CE on an interactive historical globe.';
  panel.append(tagline);

  const source = document.createElement('p');
  source.textContent =
    'Data: historical basemaps, world in 100 CE (CC-BY 4.0, ' +
    'github.com/aourednik/historical-basemaps). Boundaries are ' +
    'approximations of the period, not legal claims.';
  panel.append(source);

  button.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    button.setAttribute('aria-expanded', String(!panel.hidden));
  });

  root.append(button);
  root.append(panel);

  return {
    toggle() {
      button.click();
    },
  };
}
