import * as Cesium from 'cesium';
import { UNNAMED_LABEL } from '../geojson/types';
import type { FeatureCollection } from '../geojson/types';

export interface LabelOverlayController {
  update(collection: FeatureCollection, viewer: { scene: Cesium.Scene }): void;
  destroy(): void;
}

export function createLabelOverlay(root: HTMLElement): LabelOverlayController {
  const container = document.createElement('div');
  container.className = 'label-overlay';
  container.style.cssText =
    'position:absolute;pointer-events:none;inset:0;z-index:10;overflow:hidden';
  root.append(container);

  let labels: Array<{ el: HTMLElement; lon: number; lat: number }> = [];
  let viewer: { scene: Cesium.Scene } | null = null;
  let rafId = 0;

  function updatePositions() {
    if (!viewer) return;
    const scene = viewer.scene;
    for (const l of labels) {
      const pos = Cesium.Cartesian3.fromDegrees(l.lon, l.lat, 0);
      const screenPos = Cesium.SceneTransforms.wgs84ToWindowCoordinates(
        scene,
        pos,
      );
      if (screenPos) {
        const dist = Cesium.Cartesian3.distance(scene.camera.positionWC, pos);
        const scale = Math.max(0.6, Math.min(3.0, 3500000 / dist));
        const fs = Math.round(14 * scale);
        l.el.style.display = '';
        l.el.style.left = screenPos.x + 'px';
        l.el.style.top = screenPos.y - 20 * scale + 'px';
        l.el.style.fontSize = fs + 'px';
        l.el.style.transform = 'translate(-50%,-100%)';
      } else {
        l.el.style.display = 'none';
      }
    }
    rafId = requestAnimationFrame(updatePositions);
  }

  return {
    update(collection: FeatureCollection, v: { scene: Cesium.Scene }) {
      viewer = v;
      labels.forEach((l) => l.el.remove());
      labels = [];
      for (const f of collection.features) {
        const name = f.properties.NAME;
        if (!name || name === UNNAMED_LABEL) continue;
        const polys =
          f.geometry.type === 'MultiPolygon'
            ? (f.geometry.coordinates as number[][][][])
            : [f.geometry.coordinates as number[][][]];
        let lonSum = 0,
          latSum = 0,
          count = 0;
        for (const poly of polys) {
          for (const ring of poly) {
            for (const p of ring) {
              lonSum += p[0]!;
              latSum += p[1]!;
              count++;
            }
          }
        }
        if (!count) continue;
        const el = document.createElement('div');
        el.textContent = name;
        el.style.cssText =
          'position:absolute;color:white;font-family:ui-sans-serif,system-ui,sans-serif;' +
          'font-weight:bold;text-shadow:0 0 4px rgba(0,0,0,0.8),0 0 8px rgba(0,0,0,0.6);' +
          'white-space:nowrap;pointer-events:none';
        container.append(el);
        labels.push({ el, lon: lonSum / count, lat: latSum / count });
      }
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updatePositions);
    },
    destroy() {
      if (rafId) cancelAnimationFrame(rafId);
      container.remove();
    },
  };
}
