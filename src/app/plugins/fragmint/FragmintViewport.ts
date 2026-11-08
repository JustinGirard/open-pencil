import { BaseData } from '@/app/plugins/base/BaseData'

// Initial tuning values. Exact visual alignment is not
// required for this implementation.
const PAN_X_SCALE = 1
const PAN_Y_SCALE = 1
const ZOOM_SCALE = 1

export const PAN_EPSILON_PX = 1
export const ZOOM_EPSILON = 0.0001

export class FragmintViewport extends BaseData.define({
  pan_x: 'number',
  pan_y: 'number',
  zoom: 'number'
}) {
  // The ONE authoritative ephemeral viewport reference.
  static current: FragmintViewport | null = null

  toCanvasKitParameters(
    width: number,
    height: number
  ): { panX: number; panY: number; zoom: number } {
    if (!Number.isFinite(width) || width <= 0)
      throw new Error('viewport width must be finite positive.')
    if (!Number.isFinite(height) || height <= 0)
      throw new Error('viewport height must be finite positive.')

    if (!Number.isFinite(this.pan_x))
      throw new Error('pan_x must be finite.')
    if (!Number.isFinite(this.pan_y))
      throw new Error('pan_y must be finite.')
    if (!Number.isFinite(this.zoom) || this.zoom <= 0)
      throw new Error('zoom must be finite positive.')

    if (!Number.isFinite(PAN_X_SCALE) || PAN_X_SCALE === 0)
      throw new Error('PAN_X_SCALE must be finite non-zero.')
    if (!Number.isFinite(PAN_Y_SCALE) || PAN_Y_SCALE === 0)
      throw new Error('PAN_Y_SCALE must be finite non-zero.')
    if (!Number.isFinite(ZOOM_SCALE) || ZOOM_SCALE <= 0)
      throw new Error('ZOOM_SCALE must be finite positive.')

    const zoom = this.zoom * ZOOM_SCALE

    const panX = width / 2 + this.pan_x * PAN_X_SCALE * zoom
    const panY = height / 2 + this.pan_y * PAN_Y_SCALE * zoom

    if (!Number.isFinite(panX) || !Number.isFinite(panY))
      throw new Error('converted CanvasKit pan must be finite.')
    if (!Number.isFinite(zoom) || zoom <= 0)
      throw new Error('converted CanvasKit zoom must be finite positive.')

    return { panX, panY, zoom }
  }

  fromCanvasKitParameters(
    panX: number,
    panY: number,
    zoom: number,
    width: number,
    height: number
  ): FragmintViewport {
    if (!Number.isFinite(panX) || !Number.isFinite(panY))
      throw new Error('CanvasKit pan must be finite.')
    if (!Number.isFinite(zoom) || zoom <= 0)
      throw new Error('CanvasKit zoom must be finite positive.')
    if (!Number.isFinite(width) || width <= 0)
      throw new Error('viewport width must be finite positive.')
    if (!Number.isFinite(height) || height <= 0)
      throw new Error('viewport height must be finite positive.')

    if (!Number.isFinite(PAN_X_SCALE) || PAN_X_SCALE === 0)
      throw new Error('PAN_X_SCALE must be finite non-zero.')
    if (!Number.isFinite(PAN_Y_SCALE) || PAN_Y_SCALE === 0)
      throw new Error('PAN_Y_SCALE must be finite non-zero.')
    if (!Number.isFinite(ZOOM_SCALE) || ZOOM_SCALE <= 0)
      throw new Error('ZOOM_SCALE must be finite positive.')

    const unityPanX = (panX - width / 2) / zoom / PAN_X_SCALE
    const unityPanY = (panY - height / 2) / zoom / PAN_Y_SCALE
    const unityZoom = zoom / ZOOM_SCALE

    if (!Number.isFinite(unityPanX) || !Number.isFinite(unityPanY))
      throw new Error('converted Unity pan must be finite.')
    if (!Number.isFinite(unityZoom) || unityZoom <= 0)
      throw new Error('converted Unity zoom must be finite positive.')

    return new FragmintViewport({
      pan_x: unityPanX,
      pan_y: unityPanY,
      zoom: unityZoom
    })
  }
}
