/**
 * Persisted project document. This is the only shape written to storage and
 * backups. Transient editor state (zoom, pan, selection, crop mode) never
 * lives here.
 */
export const SCHEMA_VERSION = 1;

/** A serialized Fabric object. Image `src` is stored as `asset:<id>`. */
export type SceneObject = Record<string, unknown> & { type: string };

export interface ProjectDoc {
  schemaVersion: number;
  id: string;
  name: string;
  width: number;
  height: number;
  /** CSS colour, or null for a transparent background. */
  background: string | null;
  objects: SceneObject[];
  createdAt: number;
  updatedAt: number;
}

export interface ProjectMeta {
  id: string;
  name: string;
  width: number;
  height: number;
  updatedAt: number;
  createdAt: number;
  thumbnail?: string;
}

export interface SizePreset {
  id: string;
  label: string;
  hint: string;
  width: number;
  height: number;
}

export const SIZE_PRESETS: SizePreset[] = [
  { id: 'yt', label: 'YouTube thumbnail', hint: '1280 × 720', width: 1280, height: 720 },
  { id: 'cover', label: 'Single cover art', hint: '3000 × 3000', width: 3000, height: 3000 },
  { id: 'ig', label: 'Instagram portrait', hint: '1080 × 1350', width: 1080, height: 1350 },
  { id: 'story', label: 'Story / TikTok cover', hint: '1080 × 1920', width: 1080, height: 1920 },
];

export const MIN_DIM = 16;
export const MAX_DIM = 8000;

export function uid(prefix = ''): string {
  const rnd = crypto.getRandomValues(new Uint32Array(2));
  return prefix + Date.now().toString(36) + rnd[0].toString(36) + rnd[1].toString(36);
}

export function createProject(opts: {
  name: string;
  width: number;
  height: number;
  background?: string | null;
  objects?: SceneObject[];
}): ProjectDoc {
  const now = Date.now();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: uid('p_'),
    name: opts.name,
    width: clampDim(opts.width),
    height: clampDim(opts.height),
    background: opts.background === undefined ? '#ffffff' : opts.background,
    objects: opts.objects ?? [],
    createdAt: now,
    updatedAt: now,
  };
}

export function clampDim(n: number): number {
  if (!Number.isFinite(n)) return 1080;
  return Math.max(MIN_DIM, Math.min(MAX_DIM, Math.round(n)));
}

/** Upgrade any stored/imported document to the current schema. */
export function migrateProject(raw: unknown): ProjectDoc {
  if (!raw || typeof raw !== 'object') throw new Error('Not a project document');
  const d = raw as Partial<ProjectDoc>;
  const version = typeof d.schemaVersion === 'number' ? d.schemaVersion : 0;
  if (version > SCHEMA_VERSION) {
    throw new Error(`This project was made by a newer version (schema ${version}).`);
  }
  if (typeof d.width !== 'number' || typeof d.height !== 'number' || !Array.isArray(d.objects)) {
    throw new Error('Project document is missing size or objects');
  }
  // v0 -> v1: no structural differences beyond the explicit version field.
  return {
    schemaVersion: SCHEMA_VERSION,
    id: typeof d.id === 'string' ? d.id : uid('p_'),
    name: typeof d.name === 'string' ? d.name : 'Untitled design',
    width: clampDim(d.width),
    height: clampDim(d.height),
    background: d.background === undefined ? '#ffffff' : d.background,
    objects: d.objects as SceneObject[],
    createdAt: d.createdAt ?? Date.now(),
    updatedAt: d.updatedAt ?? Date.now(),
  };
}

/** Asset ids referenced anywhere in a scene (including nested groups). */
export function collectAssetIds(objects: SceneObject[]): string[] {
  const out = new Set<string>();
  const walk = (list: unknown[]) => {
    for (const o of list as SceneObject[]) {
      if (typeof o.assetId === 'string') out.add(o.assetId);
      if (Array.isArray(o.objects)) walk(o.objects);
    }
  };
  walk(objects);
  return [...out];
}

/** Map every image src through `fn` (deep). Returns new objects. */
export function mapImageSources(
  objects: SceneObject[],
  fn: (o: SceneObject) => string | undefined,
): SceneObject[] {
  return objects.map((o) => {
    const copy: SceneObject = { ...o };
    if (copy.type === 'Image' || copy.type === 'image') {
      const src = fn(copy);
      if (src !== undefined) copy.src = src;
    }
    if (Array.isArray(copy.objects)) copy.objects = mapImageSources(copy.objects as SceneObject[], fn);
    return copy;
  });
}
