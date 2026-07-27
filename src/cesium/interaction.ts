import * as Cesium from 'cesium';
import type { TooltipController } from '../ui/tooltip';

/**
 * Wires hover tooltip and click selection to `viewer`.
 *
 * `onClick` is the M1 click callback — receives the resolved entity name
 * (or `null` when the picked pixel has no entity). Caller chooses what to do
 * with it (currently logged to dev-only or surfaced in a future side panel).
 */
export interface InteractionHandlers {
  onHoverName?(name: string | null): void;
  onClick?(name: string | null): void;
}

export function installInteraction(
  viewer: Cesium.Viewer,
  tooltip: TooltipController,
  handlers?: InteractionHandlers,
): void {
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  handler.setInputAction((movement: { endPosition: Cesium.Cartesian2 }) => {
    const picked = viewer.scene.pick(movement.endPosition);
    const name = pickEntityName(picked, movement.endPosition);
    if (name !== null) {
      tooltip.show(name);
      tooltip.moveTo(movement.endPosition.x + 15, movement.endPosition.y + 15);
      handlers?.onHoverName?.(name);
    } else {
      tooltip.hide();
      handlers?.onHoverName?.(null);
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
    const name = pickEntityName(
      viewer.scene.pick(click.position),
      click.position,
    );
    handlers?.onClick?.(name);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

function pickEntityName(
  picked: Cesium.Entity | { id?: unknown } | undefined,
  _screen: Cesium.Cartesian2,
): string | null {
  if (!Cesium.defined(picked)) return null;
  const id = (picked as { id?: unknown }).id;
  if (!id || typeof id !== 'object') return null;
  const name = (id as Cesium.Entity).name;
  return typeof name === 'string' && name.length > 0 ? name : null;
}
