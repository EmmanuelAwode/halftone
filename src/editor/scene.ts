import { StaticCanvas, util, type FabricObject } from 'fabric';
import { assetUrl, MISSING_IMAGE } from '../lib/assets';
import { collectAssetIds, mapImageSources, type SceneObject } from '../lib/project';
import './factories';

export interface SceneData {
  width: number;
  height: number;
  background: string | null;
  objects: SceneObject[];
}

/** Replace runtime blob URLs with stable `asset:<id>` references. */
export function toPersisted(objects: SceneObject[]): SceneObject[] {
  return mapImageSources(objects, (o) => (typeof o.assetId === 'string' ? `asset:${o.assetId}` : undefined));
}

/** Resolve `asset:<id>` references into object URLs that Fabric can load. */
export async function hydrate(objects: SceneObject[]): Promise<SceneObject[]> {
  const ids = collectAssetIds(objects);
  const urls = new Map<string, string>();
  await Promise.all(
    ids.map(async (id) => {
      const u = await assetUrl(id);
      urls.set(id, u ?? MISSING_IMAGE);
    }),
  );
  return mapImageSources(objects, (o) => {
    if (typeof o.assetId === 'string') return urls.get(o.assetId) ?? MISSING_IMAGE;
    if (typeof o.src === 'string' && o.src.startsWith('asset:')) return MISSING_IMAGE;
    return undefined;
  });
}

export async function enliven(objects: SceneObject[]): Promise<FabricObject[]> {
  return (await util.enlivenObjects(objects as any[])) as FabricObject[];
}

/**
 * Render a scene at exact design pixels (times `scale`) on an off-screen
 * canvas, completely independent of the editor's zoom and pan.
 * Photo spots (empty placeholders) are left out of the output.
 */
export async function renderScene(
  scene: SceneData,
  opts: { scale?: number; fallbackBackground?: string } = {},
): Promise<HTMLCanvasElement> {
  const scale = opts.scale ?? 1;
  const w = Math.max(1, Math.round(scene.width * scale));
  const h = Math.max(1, Math.round(scene.height * scale));
  const el = document.createElement('canvas');
  el.width = w;
  el.height = h;
  const sc = new StaticCanvas(el, {
    width: w,
    height: h,
    enableRetinaScaling: false,
    renderOnAddRemove: false,
    backgroundColor: scene.background ?? opts.fallbackBackground ?? '',
  });
  sc.setDimensions({ width: w, height: h });
  const objs = await enliven(scene.objects.filter((o) => !o.placeholder && o.visible !== false));
  sc.add(...objs);
  sc.setViewportTransform([scale, 0, 0, scale, 0, 0]);
  sc.renderAll();
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d')!.drawImage(sc.getElement(), 0, 0);
  await sc.dispose();
  return out;
}

export function canvasToBlob(c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Export failed'))), type, quality));
}

export async function renderThumbnail(scene: SceneData): Promise<string> {
  const scale = Math.min(1, 360 / Math.max(scene.width, scene.height));
  const c = await renderScene(scene, { scale });
  if (scene.background === null) return c.toDataURL('image/png');
  return c.toDataURL('image/jpeg', 0.82);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function safeFilename(name: string): string {
  return (name.trim() || 'design').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').slice(0, 80);
}
