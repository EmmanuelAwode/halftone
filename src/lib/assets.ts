import { getAsset, putAsset, type AssetRecord } from './db';
import { uid } from './project';

export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const ACCEPT_ATTR = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp';
/** Matches Fabric's WebGL filter texture size so adjustments stay exact. */
const MAX_SIDE = 4096;

const urlCache = new Map<string, string>();

export function isAcceptedImage(file: File): boolean {
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  return /\.(png|jpe?g|webp)$/i.test(file.name);
}

function guessType(file: File): string {
  if (ACCEPTED_TYPES.includes(file.type)) return file.type;
  if (/\.png$/i.test(file.name)) return 'image/png';
  if (/\.webp$/i.test(file.name)) return 'image/webp';
  return 'image/jpeg';
}

/** Decode, downscale very large photos, and store in IndexedDB. */
export async function importImageFile(file: File): Promise<AssetRecord> {
  if (!isAcceptedImage(file)) throw new Error(`${file.name}: only PNG, JPEG and WebP are supported`);
  const type = guessType(file);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`${file.name}: could not decode this image`);
  }
  let { width, height } = bitmap;
  let blob: Blob = file.type === type ? file : new Blob([file], { type });
  const longest = Math.max(width, height);
  if (longest > MAX_SIDE) {
    const s = MAX_SIDE / longest;
    width = Math.round(width * s);
    height = Math.round(height * s);
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    blob = await new Promise<Blob>((res, rej) =>
      c.toBlob((b) => (b ? res(b) : rej(new Error('Resize failed'))), type, 0.92),
    );
  }
  bitmap.close();
  const rec: AssetRecord = {
    id: uid('a_'),
    blob,
    type,
    name: file.name,
    width,
    height,
    createdAt: Date.now(),
  };
  await putAsset(rec);
  urlCache.set(rec.id, URL.createObjectURL(blob));
  return rec;
}

/** Object URL for a stored asset (cached for the session). */
export async function assetUrl(id: string): Promise<string | undefined> {
  const hit = urlCache.get(id);
  if (hit) return hit;
  const rec = await getAsset(id);
  if (!rec) return undefined;
  const url = URL.createObjectURL(rec.blob);
  urlCache.set(id, url);
  return url;
}

export function cachedAssetUrl(id: string): string | undefined {
  return urlCache.get(id);
}

/** 1×1 transparent PNG used when an asset is missing so the design still opens. */
export const MISSING_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
