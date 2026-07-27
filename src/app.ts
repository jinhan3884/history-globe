import * as Cesium from 'cesium';
import { DATASET_PATH } from './config';
import { createViewer } from './cesium/createViewer';
import { renderGeoJson } from './cesium/renderGeoJson';
import { installInteraction } from './cesium/interaction';
import { GeoJsonLoadError, loadGeoJson } from './geojson/loadGeoJson';
import { diagnoseFeatureCollection } from './geojson/diagnostics';
import { formatDevSummary } from './geojson/report';
import { createLoading } from './ui/loading';
import { createErrorPanel } from './ui/errorPanel';
import { createTooltip } from './ui/tooltip';
import { UNNAMED_LABEL } from './geojson/types';

/**
 * Mount point #root hosts three children:
 *   - the Cesium canvas (created by createViewer)
 *   - the loading overlay (created by createLoading)
 *   - the error overlay (created by createErrorPanel)
 *   - the tooltip (created by createTooltip)
 *   - a small attribution credit (created here)
 *
 * Order matters for visual stacking: attribution is appended last so it is
 * above the canvas but below the error overlay (the error overlay is itself
 * appended after the tooltip, so it sits on the very top).
 */
export function mountApp(root: HTMLElement): void {
  const loading = createLoading(root);
  const errorPanel = createErrorPanel(root);
  rendering(root, loading, errorPanel);
}

function rendering(
  root: HTMLElement,
  loading: ReturnType<typeof createLoading>,
  errorPanel: ReturnType<typeof createErrorPanel>,
): void {
  let viewer: Cesium.Viewer;
  try {
    viewer = createViewer(root);
  } catch (createError) {
    loading.hide();
    errorPanel.show(
      'Could not start the 3D globe.',
      describeError(createError),
    );
    return;
  }

  const tooltip = createTooltip(root);
  installInteraction(viewer, tooltip, {
    onHoverName(name) {
      // Hover name is surfaced via the tooltip element only in M1.
      void name;
    },
    onClick(name) {
      // Click selection is shown via the browser console in dev mode only;
      // a proper side panel arrives in M5.
      if (import.meta.env.DEV) {
        if (name !== null) {
          if (name === UNNAMED_LABEL) {
            console.info('[history-atlas] clicked unnamed feature');
          } else {
            console.info(`[history-atlas] clicked feature: ${name}`);
          }
        }
      }
    },
  });

  mountAttribution(root);

  loading.setText('Loading the historical globe…');
  void loadDataset(viewer, loading, errorPanel);
}

async function loadDataset(
  viewer: Cesium.Viewer,
  loading: ReturnType<typeof createLoading>,
  errorPanel: ReturnType<typeof createErrorPanel>,
): Promise<void> {
  try {
    const result = await loadGeoJson(DATASET_PATH);
    loading.setText(`Loaded ${result.featureCount} features, drawing…`);

    // Diagnostics run *before* render so the dev console shows what the
    // renderer is about to see. We never mutate the data here; M2 is
    // observation only. The summary print is dev-bundle-only per AGENTS.md.
    if (import.meta.env.DEV) {
      const report = diagnoseFeatureCollection(result.collection);
      console.info(formatDevSummary(report.summary));
    }

    const dataSource = await renderGeoJson(viewer, result.collection);
    loading.hide();
    await viewer.flyTo(dataSource);
  } catch (loadError) {
    loading.hide();
    const message =
      loadError instanceof GeoJsonLoadError
        ? 'The historical dataset failed to load.'
        : 'The globe failed to render the loaded dataset.';
    errorPanel.show(message, describeError(loadError));
  }
}

function mountAttribution(root: HTMLElement): void {
  const credit = document.createElement('div');
  credit.className = 'attribution';
  credit.innerHTML = [
    '<strong>History Atlas</strong> — History has coordinates.',
    ' Historical basemap: world, 100 CE.',
    ' Attribution and license details will appear here before public launch.',
  ].join(' ');
  root.append(credit);
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.name === error.message
      ? error.name
      : `${error.name}: ${error.message}`;
  }
  return String(error);
}
