import { cesiumIonToken, hasCesiumIonToken } from './config';

/**
 * Mounts the Milestone 0 loading shell into the #root element.
 *
 * This milestone intentionally renders only a branded placeholder so we can
 * prove the toolchain (TypeScript, Vite, Cesium static-copy) is wired
 * correctly before introducing the Cesium viewer and dataset load in
 * Milestone 1.
 *
 * No Cesium is imported here. No token is read into Cesium yet. The token is
 * only surfaced to a visible dev-mode notice so a developer can confirm their
 * `.env` was picked up without inspecting network requests.
 */
export function mountApp(root: HTMLElement): void {
  root.innerHTML = `
    <main class="shell">
      <h1 class="brand">History Atlas</h1>
      <p class="tagline">History has coordinates.</p>
      <p class="status" data-role="loading">Loading…</p>
      <p class="notice"></p>
    </main>
  `;

  const notice = root.querySelector<HTMLElement>('.notice');
  if (notice) {
    if (hasCesiumIonToken) {
      notice.textContent = 'Cesium Ion token configured locally (dev only).';
    } else {
      notice.textContent =
        'No Cesium Ion token configured. The globe will still render the ' +
        'local dataset; Ion-hosted imagery is unavailable.';
    }
  }

  // Touch the token value so the bundler keeps the import; this also makes
  // the dev-mode absence obvious if someone inspects the module directly.
  void cesiumIonToken;
}
