import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ProjectDoc, ProjectMeta } from './project';

export interface AssetRecord {
  id: string;
  blob: Blob;
  type: string;
  name: string;
  width: number;
  height: number;
  createdAt: number;
}

interface HalftoneDB extends DBSchema {
  projects: { key: string; value: ProjectDoc };
  meta: { key: string; value: ProjectMeta; indexes: { updatedAt: number } };
  assets: { key: string; value: AssetRecord; indexes: { createdAt: number } };
}

let dbp: Promise<IDBPDatabase<HalftoneDB>> | null = null;

function db() {
  if (!dbp) {
    dbp = openDB<HalftoneDB>('halftone', 1, {
      upgrade(d) {
        d.createObjectStore('projects', { keyPath: 'id' });
        d.createObjectStore('meta', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
        d.createObjectStore('assets', { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
      },
    });
  }
  return dbp;
}

export async function listProjects(): Promise<ProjectMeta[]> {
  const all = await (await db()).getAll('meta');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<ProjectDoc | undefined> {
  return (await db()).get('projects', id);
}

export async function saveProject(doc: ProjectDoc, thumbnail?: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['projects', 'meta'], 'readwrite');
  const prev = await tx.objectStore('meta').get(doc.id);
  await tx.objectStore('projects').put(doc);
  await tx.objectStore('meta').put({
    id: doc.id,
    name: doc.name,
    width: doc.width,
    height: doc.height,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    thumbnail: thumbnail ?? prev?.thumbnail,
  });
  await tx.done;
}

export async function renameProject(id: string, name: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['projects', 'meta'], 'readwrite');
  const doc = await tx.objectStore('projects').get(id);
  const meta = await tx.objectStore('meta').get(id);
  if (doc) await tx.objectStore('projects').put({ ...doc, name });
  if (meta) await tx.objectStore('meta').put({ ...meta, name });
  await tx.done;
}

export async function deleteProject(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['projects', 'meta'], 'readwrite');
  await tx.objectStore('projects').delete(id);
  await tx.objectStore('meta').delete(id);
  await tx.done;
}

export async function putAsset(a: AssetRecord): Promise<void> {
  await (await db()).put('assets', a);
}

export async function getAsset(id: string): Promise<AssetRecord | undefined> {
  return (await db()).get('assets', id);
}

export async function listAssets(): Promise<AssetRecord[]> {
  const all = await (await db()).getAll('assets');
  return all.sort((a, b) => b.createdAt - a.createdAt);
}
