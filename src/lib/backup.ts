import { getAsset, getProject, putAsset, saveProject } from './db';
import { collectAssetIds, migrateProject, uid, type ProjectDoc } from './project';

/**
 * Portable, editable backup: one JSON file containing the versioned project
 * document plus every imported photo it references (base64-encoded).
 */
export const BACKUP_FORMAT = 'halftone-backup';
export const BACKUP_VERSION = 1;
export const BACKUP_EXT = '.halftone.json';

interface BackupAsset {
  id: string;
  type: string;
  name: string;
  width: number;
  height: number;
  data: string; // base64
}

interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  project: ProjectDoc;
  assets: BackupAsset[];
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return new Blob([out], { type });
}

export async function buildBackup(projectId: string): Promise<Blob> {
  const project = await getProject(projectId);
  if (!project) throw new Error('Project not found');
  const assets: BackupAsset[] = [];
  for (const id of collectAssetIds(project.objects)) {
    const a = await getAsset(id);
    if (!a) continue;
    assets.push({ id, type: a.type, name: a.name, width: a.width, height: a.height, data: await blobToBase64(a.blob) });
  }
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    project,
    assets,
  };
  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

/** Import a backup as a new project. Returns the new project id. */
export async function importBackup(file: File): Promise<string> {
  let parsed: BackupFile;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('This file is not a Halftone backup (invalid JSON).');
  }
  if (parsed?.format !== BACKUP_FORMAT) throw new Error('This file is not a Halftone backup.');
  if (parsed.version > BACKUP_VERSION) throw new Error('This backup was made by a newer version of Halftone.');
  const project = migrateProject(parsed.project);
  for (const a of parsed.assets ?? []) {
    // Asset ids are content-stable random ids; re-putting an existing one is harmless.
    await putAsset({
      id: a.id,
      type: a.type,
      name: a.name,
      width: a.width,
      height: a.height,
      blob: base64ToBlob(a.data, a.type),
      createdAt: Date.now(),
    });
  }
  const now = Date.now();
  const imported: ProjectDoc = { ...project, id: uid('p_'), createdAt: now, updatedAt: now };
  await saveProject(imported);
  return imported.id;
}
