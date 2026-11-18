import {
  ActiveSelection,
  Canvas,
  FabricImage,
  Point,
  Rect,
  Shadow,
  filters,
  util,
  type FabricObject,
  type TPointerEventInfo,
  type Textbox,
} from 'fabric';
import { importImageFile, isAcceptedImage, assetUrl } from '../lib/assets';
import type { AssetRecord } from '../lib/db';
import { saveProject } from '../lib/db';
import { clampDim, uid, type ProjectDoc, type SceneObject } from '../lib/project';
import {
  displayName,
  ensureId,
  kindOf,
  makeEllipse,
  makeLine,
  makeRect,
  makeText,
  type TextPreset,
} from './factories';
import { canvasToBlob, downloadBlob, enliven, renderScene, renderThumbnail, safeFilename, toPersisted } from './scene';

const WORKSPACE = '#16171a';
const ACCENT = '#ff6b35';
const GUIDE = '#ff4fa3';
const HISTORY_LIMIT = 100;

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';
export type Adjustment = 'brightness' | 'contrast' | 'saturation' | 'blur';
export const ADJUSTMENTS: { key: Adjustment; label: string; min: number; max: number }[] = [
  { key: 'brightness', label: 'Brightness', min: -1, max: 1 },
  { key: 'contrast', label: 'Contrast', min: -1, max: 1 },
  { key: 'saturation', label: 'Saturation', min: -1, max: 1 },
  { key: 'blur', label: 'Blur', min: 0, max: 1 },
];

interface Snapshot {
  width: number;
  height: number;
  background: string | null;
  objects: SceneObject[];
}

interface CropSession {
  img: FabricImage;
  frame: Rect;
  saved: Record<string, unknown>;
}

export interface LayerInfo {
  id: string;
  name: string;
  kind: ReturnType<typeof kindOf>;
  visible: boolean;
  locked: boolean;
  selected: boolean;
}

export class EditorController {
  readonly canvas: Canvas;
  private container: HTMLElement;
  // --- persisted document fields (everything else here is transient) ---
  doc: Omit<ProjectDoc, 'objects'>;
  // --- transient editor state ---
  zoom = 1;
  snapping = true;
  saveStatus: SaveStatus = 'saved';
  lastError: string | null = null;
  crop: CropSession | null = null;
  private autoFit = true;
  private guides: { v: number[]; h: number[] } = { v: [], h: [] };
  private history: string[] = [];
  private hIndex = -1;
  private commitTimer: number | undefined;
  private saveTimer: number | undefined;
  private restoring = false;
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  private notifyQueued = false;
  version = 0;
  private spaceDown = false;
  private panning: { x: number; y: number } | null = null;
  private clipboard: SceneObject[] | null = null;
  private resizeObs: ResizeObserver;
  private checker: CanvasPattern | null = null;
  private disposed = false;
  private lastThumbAt = 0;
  onRequestPhoto: ((target?: FabricObject) => void) | null = null;
  onToast: ((msg: string, kind?: 'error' | 'info') => void) | null = null;

  constructor(el: HTMLCanvasElement, container: HTMLElement, doc: ProjectDoc) {
    this.container = container;
    const { objects: _objects, ...rest } = doc;
    void _objects;
    this.doc = rest;
    this.canvas = new Canvas(el, {
      preserveObjectStacking: true,
      selectionColor: 'rgba(255,107,53,0.08)',
      selectionBorderColor: ACCENT,
      selectionLineWidth: 1,
      stopContextMenu: true,
      fireMiddleClick: true,
      uniScaleKey: 'shiftKey',
      targetFindTolerance: 4,
    });
    this.resize();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.bindEvents();
  }

  // ---------------------------------------------------------------- lifecycle
  async load(objects: SceneObject[], hydrateFn: (o: SceneObject[]) => Promise<SceneObject[]>) {
    const objs = await enliven(await hydrateFn(objects));
    if (this.disposed) return;
    this.canvas.add(...objs);
    objs.forEach((o) => this.decorate(o));
    this.fit();
    this.history = [this.snapshotString()];
    this.hIndex = 0;
    this.canvas.requestRenderAll();
    this.emit();
  }

  async dispose() {
    this.disposed = true;
    this.resizeObs.disconnect();
    await this.flushSave();
    await this.canvas.dispose();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = () => this.version;

  private emit() {
    if (this.notifyQueued) return;
    this.notifyQueued = true;
    requestAnimationFrame(() => {
      this.notifyQueued = false;
      this.version++;
      this.listeners.forEach((l) => l());
    });
  }

  // ---------------------------------------------------------------- viewport
  private resize() {
    const r = this.container.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    this.canvas.setDimensions({ width: Math.floor(r.width), height: Math.floor(r.height) });
    if (this.autoFit) this.fit();
    else this.canvas.requestRenderAll();
  }

  fit() {
    const cw = this.canvas.getWidth();
    const ch = this.canvas.getHeight();
    const pad = 56;
    const z = Math.max(0.02, Math.min((cw - pad * 2) / this.doc.width, (ch - pad * 2) / this.doc.height, 4));
    this.canvas.setViewportTransform([z, 0, 0, z, (cw - this.doc.width * z) / 2, (ch - this.doc.height * z) / 2]);
    this.zoom = z;
    this.autoFit = true;
    this.canvas.requestRenderAll();
    this.emit();
  }

  setZoom(z: number, at?: Point) {
    const clamped = Math.max(0.02, Math.min(8, z));
    const p = at ?? new Point(this.canvas.getWidth() / 2, this.canvas.getHeight() / 2);
    this.canvas.zoomToPoint(p, clamped);
    this.zoom = clamped;
    this.autoFit = false;
    this.canvas.requestRenderAll();
    this.emit();
  }

  zoomBy(f: number) {
    this.setZoom(this.zoom * f);
  }

  /** Centre of the visible design area in design coordinates. */
  private viewCenter(): Point {
    const vp = this.canvas.viewportTransform;
    const c = new Point(this.canvas.getWidth() / 2, this.canvas.getHeight() / 2);
    const p = c.transform(util.invertTransform(vp));
    return new Point(
      Math.max(0, Math.min(this.doc.width, p.x)),
      Math.max(0, Math.min(this.doc.height, p.y)),
    );
  }

  // ---------------------------------------------------------------- events
  private bindEvents() {
    const c = this.canvas;
    c.on('selection:created', () => this.emit());
    c.on('selection:updated', () => this.emit());
    c.on('selection:cleared', () => this.emit());
    c.on('object:moving', (e) => {
      this.snap(e.target);
      this.emit();
    });
    c.on('object:scaling', () => this.emit());
    c.on('object:rotating', () => this.emit());
    c.on('object:modified', (e) => {
      if (e.target && this.crop && e.target === this.crop.frame) {
        this.syncCropPreview();
        return;
      }
      this.bakeTextScale(e.target);
      this.clearGuides();
      this.commit();
    });
    c.on('text:changed', () => {
      this.scheduleCommit(800);
      this.emit();
    });
    c.on('text:editing:exited', () => this.commit());
    c.on('mouse:dblclick', (e) => {
      const t = e.target;
      if (!t) return;
      if (kindOf(t) === 'image') this.startCrop(t as FabricImage);
      else if (kindOf(t) === 'placeholder') this.onRequestPhoto?.(t);
    });
    c.on('mouse:wheel', (opt) => this.onWheel(opt));
    c.on('mouse:down', (opt) => {
      const ev = opt.e as MouseEvent;
      if (this.spaceDown || ev.button === 1) {
        this.panning = { x: ev.clientX, y: ev.clientY };
        c.setCursor('grabbing');
      }
    });
    c.on('mouse:move', (opt) => {
      if (!this.panning) return;
      const ev = opt.e as MouseEvent;
      c.relativePan(new Point(ev.clientX - this.panning.x, ev.clientY - this.panning.y));
      this.panning = { x: ev.clientX, y: ev.clientY };
      this.autoFit = false;
    });
    c.on('mouse:up', () => {
      if (this.panning) {
        this.panning = null;
        c.setCursor(this.spaceDown ? 'grab' : 'default');
      }
      this.clearGuides();
    });
    c.on('before:render', ({ ctx }) => this.drawArtboard(ctx));
    c.on('after:render', ({ ctx }) => this.drawOverlay(ctx));
    // crop frame live preview
    c.on('object:moving', (e) => this.crop && e.target === this.crop.frame && this.syncCropPreview());
    c.on('object:scaling', (e) => this.crop && e.target === this.crop.frame && this.syncCropPreview());
  }

  setSpace(down: boolean) {
    if (this.spaceDown === down) return;
    this.spaceDown = down;
    this.canvas.skipTargetFind = down;
    this.canvas.selection = !down;
    this.canvas.defaultCursor = down ? 'grab' : 'default';
    this.canvas.setCursor(this.canvas.defaultCursor);
  }

  private onWheel(opt: TPointerEventInfo<WheelEvent>) {
    const e = opt.e;
    e.preventDefault();
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      const factor = Math.pow(0.998, e.deltaY);
      this.setZoom(this.zoom * factor, this.canvas.getViewportPoint(e));
    } else {
      const dx = e.shiftKey && !e.deltaX ? -e.deltaY : -e.deltaX;
      const dy = e.shiftKey && !e.deltaX ? 0 : -e.deltaY;
      this.canvas.relativePan(new Point(dx, dy));
      this.autoFit = false;
      this.canvas.requestRenderAll();
    }
  }

  // ---------------------------------------------------------------- drawing
  private artboardScreenRect() {
    const vp = this.canvas.viewportTransform;
    return { x: vp[4], y: vp[5], w: this.doc.width * vp[0], h: this.doc.height * vp[3] };
  }

  private drawArtboard(ctx: CanvasRenderingContext2D) {
    if (ctx !== this.canvas.getContext()) return;
    const r = this.artboardScreenRect();
    ctx.save();
    ctx.fillStyle = WORKSPACE;
    ctx.fillRect(0, 0, this.canvas.getWidth(), this.canvas.getHeight());
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6;
    if (this.doc.background) {
      ctx.fillStyle = this.doc.background;
    } else {
      if (!this.checker) {
        const p = document.createElement('canvas');
        p.width = p.height = 16;
        const pc = p.getContext('2d')!;
        pc.fillStyle = '#ffffff';
        pc.fillRect(0, 0, 16, 16);
        pc.fillStyle = '#e3e5e9';
        pc.fillRect(0, 0, 8, 8);
        pc.fillRect(8, 8, 8, 8);
        this.checker = ctx.createPattern(p, 'repeat');
      }
      ctx.fillStyle = this.checker ?? '#ffffff';
    }
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.restore();
  }

  private drawOverlay(ctx: CanvasRenderingContext2D) {
    if (ctx !== this.canvas.getContext()) return;
    const r = this.artboardScreenRect();
    const W = this.canvas.getWidth();
    const H = this.canvas.getHeight();
    ctx.save();
    // dim anything hanging outside the artboard so the export area is obvious
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = 'rgba(22,23,26,0.72)';
    ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(r.x) - 0.5, Math.round(r.y) - 0.5, Math.round(r.w) + 1, Math.round(r.h) + 1);
    // crop mode: darken the parts of the photo that will be cut away
    if (this.crop) {
      const vp = this.canvas.viewportTransform;
      const poly = (pts: Point[]) => {
        const s = pts.map((p) => p.transform(vp));
        ctx.moveTo(s[0].x, s[0].y);
        for (const p of s.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.closePath();
      };
      ctx.beginPath();
      poly(this.crop.img.getCoords());
      poly(this.crop.frame.getCoords());
      ctx.fillStyle = 'rgba(12,12,14,0.62)';
      ctx.fill('evenodd');
    }
    // snapping guides
    if (this.guides.v.length || this.guides.h.length) {
      const vp = this.canvas.viewportTransform;
      ctx.strokeStyle = GUIDE;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      for (const x of this.guides.v) {
        const sx = Math.round(x * vp[0] + vp[4]) + 0.5;
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, H);
        ctx.stroke();
      }
      for (const y of this.guides.h) {
        const sy = Math.round(y * vp[3] + vp[5]) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, sy);
        ctx.lineTo(W, sy);
        ctx.stroke();
      }
    }
    ctx.restore();
    // controls were drawn before the overlay; redraw them on top
    this.canvas.drawControls(ctx);
  }

  // ---------------------------------------------------------------- snapping
  private snap(target?: FabricObject) {
    this.guides = { v: [], h: [] };
    if (!target || !this.snapping || (this.crop && target === this.crop.frame)) return;
    const th = 7 / this.zoom;
    // Fabric updates left/top during a drag but not the cached corners; refresh before measuring
    target.setCoords();
    const r = target.getBoundingRect();
    const mine = [r.left, r.left + r.width / 2, r.left + r.width];
    const mineY = [r.top, r.top + r.height / 2, r.top + r.height];
    const candX = [0, this.doc.width / 2, this.doc.width];
    const candY = [0, this.doc.height / 2, this.doc.height];
    const active = new Set(this.canvas.getActiveObjects());
    for (const o of this.canvas.getObjects()) {
      if (o === target || active.has(o) || !o.visible || o.excludeFromExport) continue;
      const b = o.getBoundingRect();
      candX.push(b.left, b.left + b.width / 2, b.left + b.width);
      candY.push(b.top, b.top + b.height / 2, b.top + b.height);
    }
    const best = (mine: number[], cands: number[]) => {
      let d = Infinity;
      let at = 0;
      for (const m of mine)
        for (const c of cands) {
          const diff = c - m;
          if (Math.abs(diff) < Math.abs(d) && Math.abs(diff) <= th) {
            d = diff;
            at = c;
          }
        }
      return Number.isFinite(d) ? { d, at } : null;
    };
    const bx = best(mine, candX);
    const by = best(mineY, candY);
    if (bx) {
      target.set('left', target.left + bx.d);
      this.guides.v.push(bx.at);
    }
    if (by) {
      target.set('top', target.top + by.d);
      this.guides.h.push(by.at);
    }
    target.setCoords();
  }

  private clearGuides() {
    if (this.guides.v.length || this.guides.h.length) {
      this.guides = { v: [], h: [] };
      this.canvas.requestRenderAll();
    }
  }

  // ---------------------------------------------------------------- decoration
  decorate(o: FabricObject) {
    ensureId(o);
    o.set({
      borderColor: ACCENT,
      cornerColor: '#ffffff',
      cornerStrokeColor: ACCENT,
      cornerStyle: 'circle',
      transparentCorners: false,
      cornerSize: 10,
      borderScaleFactor: 1.5,
      padding: 0,
    });
    if (kindOf(o) === 'image') {
      // photos keep their proportions: only corner handles are offered
      o.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false });
    }
    this.applyLock(o, !!(o as any).locked);
  }

  private applyLock(o: FabricObject, locked: boolean) {
    (o as any).locked = locked;
    o.set({
      lockMovementX: locked,
      lockMovementY: locked,
      lockScalingX: locked,
      lockScalingY: locked,
      lockRotation: locked,
      hasControls: !locked,
      hoverCursor: locked ? 'default' : 'move',
    });
    if (kindOf(o) === 'text') (o as Textbox).editable = !locked;
  }

  private bakeTextScale(o?: FabricObject) {
    if (!o || kindOf(o) !== 'text') return;
    const t = o as Textbox;
    if (Math.abs(t.scaleX - 1) < 1e-3 && Math.abs(t.scaleY - 1) < 1e-3) return;
    if (Math.abs(t.scaleX - t.scaleY) > 1e-3) return;
    const s = t.scaleX;
    t.set({
      fontSize: Math.round(t.fontSize * s * 10) / 10,
      width: t.width * s,
      strokeWidth: t.strokeWidth * s,
      scaleX: 1,
      scaleY: 1,
    });
    if (t.shadow) {
      const sh = t.shadow as Shadow;
      t.set('shadow', new Shadow({ color: sh.color, blur: sh.blur * s, offsetX: sh.offsetX * s, offsetY: sh.offsetY * s }));
    }
    t.setCoords();
  }

  // ---------------------------------------------------------------- history
  private sceneObjects(): SceneObject[] {
    return this.canvas
      .getObjects()
      .filter((o) => !o.excludeFromExport)
      .map((o) => o.toObject() as SceneObject);
  }

  snapshot(): Snapshot {
    return { width: this.doc.width, height: this.doc.height, background: this.doc.background, objects: this.sceneObjects() };
  }

  private snapshotString() {
    return JSON.stringify(this.snapshot());
  }

  /** Record one undo step if the scene changed. */
  commit() {
    window.clearTimeout(this.commitTimer);
    this.commitTimer = undefined;
    if (this.restoring || this.crop || this.hIndex < 0) return;
    const s = this.snapshotString();
    if (s === this.history[this.hIndex]) {
      this.emit();
      return;
    }
    this.history = this.history.slice(0, this.hIndex + 1);
    this.history.push(s);
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
    this.hIndex = this.history.length - 1;
    this.markDirty();
    this.emit();
  }

  /** Commit after a quiet period — for typing and colour pickers. */
  scheduleCommit(ms = 450) {
    window.clearTimeout(this.commitTimer);
    this.commitTimer = window.setTimeout(() => this.commit(), ms);
  }

  get canUndo() {
    return this.hIndex > 0 || this.commitTimer !== undefined;
  }
  get canRedo() {
    return this.hIndex < this.history.length - 1;
  }

  undo() {
    if (this.crop) return this.cancelCrop();
    if (this.commitTimer !== undefined) this.commit();
    if (this.hIndex <= 0) return;
    this.hIndex--;
    this.enqueueRestore(this.history[this.hIndex]);
  }

  redo() {
    if (this.crop) return;
    if (this.hIndex >= this.history.length - 1) return;
    this.hIndex++;
    this.enqueueRestore(this.history[this.hIndex]);
  }

  private enqueueRestore(s: string) {
    this.queue = this.queue.then(() => this.restore(s)).catch((e) => console.error(e));
  }

  private async restore(s: string) {
    const snap = JSON.parse(s) as Snapshot;
    const selectedIds = this.canvas.getActiveObjects().map((o) => (o as any).id);
    this.restoring = true;
    try {
      const objs = await enliven(snap.objects);
      const sizeChanged = snap.width !== this.doc.width || snap.height !== this.doc.height;
      this.doc = { ...this.doc, width: snap.width, height: snap.height, background: snap.background };
      this.canvas.discardActiveObject();
      this.canvas.remove(...this.canvas.getObjects());
      this.canvas.add(...objs);
      objs.forEach((o) => this.decorate(o));
      const reselect = objs.filter((o) => selectedIds.includes((o as any).id) && o.visible);
      if (reselect.length === 1) this.canvas.setActiveObject(reselect[0]);
      else if (reselect.length > 1) this.canvas.setActiveObject(new ActiveSelection(reselect, { canvas: this.canvas }));
      if (sizeChanged) this.fit();
      this.canvas.requestRenderAll();
    } finally {
      this.restoring = false;
    }
    this.markDirty();
    this.emit();
  }

  // ---------------------------------------------------------------- saving
  private markDirty() {
    this.saveStatus = 'unsaved';
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.save(), 600);
  }

  async flushSave() {
    if (this.commitTimer !== undefined) this.commit();
    if (this.saveTimer !== undefined || this.saveStatus === 'unsaved') {
      window.clearTimeout(this.saveTimer);
      await this.save(true);
    }
  }

  private async save(forceThumb = false) {
    this.saveTimer = undefined;
    if (this.crop) {
      // never persist the temporary crop view; try again after the crop ends
      this.saveTimer = window.setTimeout(() => void this.save(), 800);
      return;
    }
    // the committed history head is the source of truth for what gets saved
    const snap = JSON.parse(this.history[this.hIndex] ?? this.snapshotString()) as Snapshot;
    this.saveStatus = 'saving';
    this.emit();
    try {
      const doc: ProjectDoc = {
        ...this.doc,
        width: snap.width,
        height: snap.height,
        background: snap.background,
        objects: toPersisted(snap.objects),
        updatedAt: Date.now(),
      };
      let thumb: string | undefined;
      if (forceThumb || Date.now() - this.lastThumbAt > 1500) {
        thumb = await renderThumbnail(snap).catch(() => undefined);
        this.lastThumbAt = Date.now();
      }
      await saveProject(doc, thumb);
      this.doc = { ...this.doc, updatedAt: doc.updatedAt };
      if (this.saveTimer === undefined) this.saveStatus = 'saved';
      this.lastError = null;
    } catch (e) {
      console.error(e);
      this.saveStatus = 'error';
      this.lastError = e instanceof Error ? e.message : String(e);
    }
    this.emit();
  }

  rename(name: string) {
    this.doc = { ...this.doc, name: name.trim() || 'Untitled design' };
    this.markDirty();
    this.emit();
  }

  // ---------------------------------------------------------------- selection & layers
  selection(): FabricObject[] {
    return this.canvas.getActiveObjects();
  }

  objects(): FabricObject[] {
    return this.canvas.getObjects().filter((o) => !o.excludeFromExport);
  }

  byId(id: string): FabricObject | undefined {
    return this.objects().find((o) => (o as any).id === id);
  }

  layers(): LayerInfo[] {
    const sel = new Set(this.selection());
    return this.objects()
      .map((o) => ({
        id: (o as any).id as string,
        name: displayName(o),
        kind: kindOf(o),
        visible: o.visible !== false,
        locked: !!(o as any).locked,
        selected: sel.has(o),
      }))
      .reverse();
  }

  select(id: string, additive = false) {
    if (this.crop) return;
    const o = this.byId(id);
    if (!o) return;
    if (!o.visible) return;
    const current = this.selection();
    if (additive && current.length) {
      const next = current.includes(o) ? current.filter((x) => x !== o) : [...current, o];
      this.canvas.discardActiveObject();
      if (next.length === 1) this.canvas.setActiveObject(next[0]);
      else if (next.length > 1) this.canvas.setActiveObject(new ActiveSelection(next, { canvas: this.canvas }));
    } else {
      this.canvas.setActiveObject(o);
    }
    this.canvas.requestRenderAll();
    this.emit();
  }

  selectAll() {
    const objs = this.objects().filter((o) => o.visible && !(o as any).locked);
    this.canvas.discardActiveObject();
    if (objs.length === 1) this.canvas.setActiveObject(objs[0]);
    else if (objs.length > 1) this.canvas.setActiveObject(new ActiveSelection(objs, { canvas: this.canvas }));
    this.canvas.requestRenderAll();
    this.emit();
  }

  deselect() {
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
    this.emit();
  }

  renameLayer(id: string, name: string) {
    const o = this.byId(id);
    if (!o) return;
    (o as any).name = name.trim() || undefined;
    this.commit();
  }

  setVisible(id: string, visible: boolean) {
    const o = this.byId(id);
    if (!o) return;
    if (!visible && this.selection().includes(o)) this.canvas.discardActiveObject();
    o.set('visible', visible);
    this.canvas.requestRenderAll();
    this.commit();
  }

  setLocked(id: string, locked: boolean) {
    const o = this.byId(id);
    if (!o) return;
    this.applyLock(o, locked);
    this.canvas.requestRenderAll();
    this.commit();
  }

  /** Move a layer to a stacking index (0 = bottom). */
  moveLayer(id: string, index: number) {
    const o = this.byId(id);
    if (!o) return;
    const count = this.objects().length;
    this.canvas.moveObjectTo(o, Math.max(0, Math.min(count - 1, index)));
    this.canvas.requestRenderAll();
    this.commit();
  }

  arrange(dir: 'forward' | 'backward' | 'front' | 'back') {
    const objs = this.selection();
    if (!objs.length) return;
    const ordered = [...objs].sort((a, b) => this.canvas.getObjects().indexOf(a) - this.canvas.getObjects().indexOf(b));
    const list = dir === 'forward' || dir === 'back' ? [...ordered].reverse() : ordered;
    for (const o of list) {
      if (dir === 'forward') this.canvas.bringObjectForward(o);
      else if (dir === 'backward') this.canvas.sendObjectBackwards(o);
      else if (dir === 'front') this.canvas.bringObjectToFront(o);
      else this.canvas.sendObjectToBack(o);
    }
    this.canvas.requestRenderAll();
    this.commit();
  }

  // ---------------------------------------------------------------- edit operations
  /** Apply properties to the selection. `live` = part of a gesture; call commit() at the end. */
  update(props: Record<string, unknown>, mode: 'live' | 'commit' | 'debounce' = 'commit', targets?: FabricObject[]) {
    const objs = targets ?? this.selection();
    for (const o of objs) {
      o.set(props as any);
      if (kindOf(o) === 'text') (o as Textbox).initDimensions();
      o.setCoords();
    }
    this.canvas.requestRenderAll();
    if (mode === 'commit') this.commit();
    else if (mode === 'debounce') this.scheduleCommit();
    this.emit();
  }

  setShadow(enabled: boolean, opts?: { color?: string; blur?: number; offsetX?: number; offsetY?: number }, mode: 'live' | 'commit' | 'debounce' = 'commit') {
    for (const o of this.selection()) {
      if (!enabled) {
        o.set('shadow', null);
      } else {
        const cur = (o.shadow as Shadow | null) ?? null;
        const base = Math.max(4, Math.round(Math.min(this.doc.width, this.doc.height) * 0.015));
        o.set(
          'shadow',
          new Shadow({
            color: opts?.color ?? cur?.color ?? 'rgba(0,0,0,0.6)',
            blur: opts?.blur ?? cur?.blur ?? base * 2,
            offsetX: opts?.offsetX ?? cur?.offsetX ?? 0,
            offsetY: opts?.offsetY ?? cur?.offsetY ?? base,
          }),
        );
      }
      o.set('dirty', true);
    }
    this.canvas.requestRenderAll();
    if (mode === 'commit') this.commit();
    else if (mode === 'debounce') this.scheduleCommit();
    this.emit();
  }

  /** Move/resize via the inspector, in design pixels. */
  setGeometry(o: FabricObject, g: { left?: number; top?: number; width?: number; height?: number; angle?: number }) {
    if (g.left !== undefined) o.set('left', g.left);
    if (g.top !== undefined) o.set('top', g.top);
    if (g.angle !== undefined) o.rotate(g.angle);
    const k = kindOf(o);
    if (g.width !== undefined && g.width > 0) {
      if (k === 'text') o.set('width', g.width / o.scaleX);
      else {
        const s = g.width / o.width;
        if (k === 'image') o.set({ scaleX: s, scaleY: s });
        else o.set('scaleX', s);
      }
    }
    if (g.height !== undefined && g.height > 0 && k !== 'text' && k !== 'line') {
      const s = g.height / o.height;
      if (k === 'image') o.set({ scaleX: s, scaleY: s });
      else o.set('scaleY', s);
    }
    o.setCoords();
    this.canvas.requestRenderAll();
    this.scheduleCommit();
    this.emit();
  }

  private place(o: FabricObject, select = true) {
    this.decorate(o);
    this.canvas.add(o);
    if (select) this.canvas.setActiveObject(o);
    this.canvas.requestRenderAll();
  }

  addText(preset: TextPreset) {
    const t = makeText(preset, this.doc.width, this.doc.height);
    const c = this.viewCenter();
    t.setPositionByOrigin(c, 'center', 'center');
    this.place(t);
    this.commit();
  }

  addShape(kind: 'rect' | 'ellipse' | 'line') {
    const { width: W, height: H } = this.doc;
    const o = kind === 'rect' ? makeRect(W, H) : kind === 'ellipse' ? makeEllipse(W, H) : makeLine(W, H);
    o.setPositionByOrigin(this.viewCenter(), 'center', 'center');
    this.place(o);
    this.commit();
  }

  async addPlaceholder() {
    const { makePlaceholder } = await import('./factories');
    const s = Math.min(this.doc.width, this.doc.height) * 0.5;
    const g = makePlaceholder(0, 0, s, s);
    g.setPositionByOrigin(this.viewCenter(), 'center', 'center');
    this.place(g);
    this.commit();
  }

  private placeholderAt(p: Point): FabricObject | undefined {
    const objs = this.objects().slice().reverse();
    return objs.find((o) => kindOf(o) === 'placeholder' && o.visible && o.containsPoint(p));
  }

  /** Import files dropped/picked by the user. `viewportPoint` is in canvas element pixels. */
  async importFiles(files: File[], opts: { viewportPoint?: { x: number; y: number }; target?: FabricObject } = {}) {
    const images = files.filter(isAcceptedImage);
    const rejected = files.length - images.length;
    if (rejected) this.onToast?.(`${rejected} file(s) skipped — use PNG, JPEG or WebP`, 'error');
    if (!images.length) return;
    let target = opts.target;
    let scenePoint: Point | undefined;
    if (opts.viewportPoint) {
      scenePoint = new Point(opts.viewportPoint.x, opts.viewportPoint.y).transform(util.invertTransform(this.canvas.viewportTransform));
      target ??= this.placeholderAt(scenePoint);
    }
    const added: FabricObject[] = [];
    for (const [i, file] of images.entries()) {
      try {
        const asset = await importImageFile(file);
        const t = i === 0 ? target : undefined;
        const img = await this.imageFromAsset(asset);
        if (t && (kindOf(t) === 'placeholder' || kindOf(t) === 'image')) {
          this.fillFrame(img, t);
        } else {
          const W = this.doc.width;
          const H = this.doc.height;
          const s = Math.min((W * 0.8) / asset.width, (H * 0.8) / asset.height, 1e9);
          img.set({ scaleX: s, scaleY: s });
          const at = scenePoint ? new Point(scenePoint.x + i * 24, scenePoint.y + i * 24) : this.viewCenter().add(new Point(i * 24, i * 24));
          img.setPositionByOrigin(at, 'center', 'center');
          this.place(img, false);
        }
        added.push(img);
      } catch (e) {
        this.onToast?.(e instanceof Error ? e.message : String(e), 'error');
      }
    }
    if (added.length) {
      this.canvas.discardActiveObject();
      this.canvas.setActiveObject(added.length === 1 ? added[0] : new ActiveSelection(added, { canvas: this.canvas }));
      this.canvas.requestRenderAll();
      this.commit();
    }
  }

  async addAsset(asset: AssetRecord, target?: FabricObject) {
    const img = await this.imageFromAsset(asset);
    if (target) this.fillFrame(img, target);
    else {
      const s = Math.min((this.doc.width * 0.8) / asset.width, (this.doc.height * 0.8) / asset.height);
      img.set({ scaleX: s, scaleY: s });
      img.setPositionByOrigin(this.viewCenter(), 'center', 'center');
      this.place(img, false);
    }
    this.canvas.setActiveObject(img);
    this.canvas.requestRenderAll();
    this.commit();
  }

  private async imageFromAsset(asset: AssetRecord): Promise<FabricImage> {
    const url = await assetUrl(asset.id);
    if (!url) throw new Error('Image missing from local storage');
    const img = await FabricImage.fromURL(url);
    (img as any).assetId = asset.id;
    (img as any).name = asset.name.replace(/\.[a-z0-9]+$/i, '');
    ensureId(img);
    return img;
  }

  /** Put `img` where `frame` is: cover-fit and crop to the frame's box, same stacking slot. */
  private fillFrame(img: FabricImage, frame: FabricObject) {
    // a photo spot's box is its inner rectangle (the group bounds include the dashed stroke)
    const box = kindOf(frame) === 'placeholder' ? ((frame as any)._objects?.[0] as FabricObject | undefined) : undefined;
    const fw = (box ? box.width : frame.width) * frame.scaleX;
    const fh = (box ? box.height : frame.height) * frame.scaleY;
    const nw = img.width;
    const nh = img.height;
    const s = Math.max(fw / nw, fh / nh);
    const cw = Math.min(nw, fw / s);
    const ch = Math.min(nh, fh / s);
    img.set({ cropX: (nw - cw) / 2, cropY: (nh - ch) / 2, width: cw, height: ch, scaleX: s, scaleY: s, angle: frame.angle });
    if (kindOf(frame) === 'image') {
      // replacing a photo keeps its adjustments
      const old = frame as FabricImage;
      img.filters = old.filters.map((f) => f);
      img.applyFilters();
      img.set({ opacity: old.opacity, shadow: old.shadow });
    }
    img.setPositionByOrigin(frame.getCenterPoint(), 'center', 'center');
    const idx = this.canvas.getObjects().indexOf(frame);
    if ((frame as any).name && kindOf(frame) === 'image') (img as any).name = (frame as any).name;
    this.canvas.remove(frame);
    this.decorate(img);
    this.canvas.insertAt(Math.max(0, idx), img);
  }

  /** Stretch-free "fill the design" for a photo. */
  fillCanvas(img: FabricImage) {
    const frame = new Rect({ left: 0, top: 0, width: this.doc.width, height: this.doc.height });
    const el = img.getElement() as HTMLImageElement;
    const nw = el.naturalWidth || el.width;
    const nh = el.naturalHeight || el.height;
    const s = Math.max(this.doc.width / nw, this.doc.height / nh);
    const cw = Math.min(nw, this.doc.width / s);
    const ch = Math.min(nh, this.doc.height / s);
    img.set({ cropX: (nw - cw) / 2, cropY: (nh - ch) / 2, width: cw, height: ch, scaleX: s, scaleY: s, angle: 0 });
    img.setPositionByOrigin(frame.getCenterPoint(), 'center', 'center');
    img.setCoords();
    this.canvas.requestRenderAll();
    this.commit();
  }

  async duplicate() {
    if (this.crop) return;
    const json = this.serializeSelection();
    if (json.length) await this.pasteObjects(json, 24);
  }

  /** Serialize the selection with absolute coordinates (multi-selections store relative ones). */
  private serializeSelection(): SceneObject[] {
    const objs = this.selection();
    if (!objs.length) return [];
    const multi = objs.length > 1;
    if (multi) this.canvas.discardActiveObject();
    const json = objs.map((o) => o.toObject() as SceneObject);
    if (multi) this.canvas.setActiveObject(new ActiveSelection(objs, { canvas: this.canvas }));
    return json;
  }

  copy() {
    const json = this.serializeSelection();
    if (!json.length) return false;
    this.clipboard = json;
    return true;
  }

  hasClipboard() {
    return !!this.clipboard?.length;
  }

  async paste() {
    if (this.clipboard) await this.pasteObjects(this.clipboard, 24);
  }

  private async pasteObjects(json: SceneObject[], offset: number) {
    const clones = await enliven(json.map((j) => ({ ...j, id: uid('o_') })));
    this.canvas.discardActiveObject();
    for (const c of clones) {
      c.set({ left: c.left + offset, top: c.top + offset });
      this.decorate(c);
      this.canvas.add(c);
    }
    this.canvas.setActiveObject(clones.length === 1 ? clones[0] : new ActiveSelection(clones, { canvas: this.canvas }));
    this.canvas.requestRenderAll();
    this.commit();
  }

  remove() {
    if (this.crop) return;
    const objs = this.selection();
    if (!objs.length) return;
    if (objs.some((o) => (o as Textbox).isEditing)) return;
    this.canvas.discardActiveObject();
    this.canvas.remove(...objs);
    this.canvas.requestRenderAll();
    this.commit();
  }

  nudge(dx: number, dy: number) {
    const sel = this.canvas.getActiveObject();
    if (!sel || (sel as any).locked) return;
    sel.set({ left: sel.left + dx, top: sel.top + dy });
    sel.setCoords();
    this.canvas.requestRenderAll();
    this.scheduleCommit(500);
    this.emit();
  }

  align(edge: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') {
    const objs = this.selection();
    if (!objs.length) return;
    let bounds = { left: 0, top: 0, width: this.doc.width, height: this.doc.height };
    const multi = objs.length > 1;
    if (multi) {
      bounds = this.canvas.getActiveObject()!.getBoundingRect();
    }
    this.canvas.discardActiveObject();
    for (const o of objs) {
      const b = o.getBoundingRect();
      let dx = 0;
      let dy = 0;
      if (edge === 'left') dx = bounds.left - b.left;
      if (edge === 'hcenter') dx = bounds.left + bounds.width / 2 - (b.left + b.width / 2);
      if (edge === 'right') dx = bounds.left + bounds.width - (b.left + b.width);
      if (edge === 'top') dy = bounds.top - b.top;
      if (edge === 'vcenter') dy = bounds.top + bounds.height / 2 - (b.top + b.height / 2);
      if (edge === 'bottom') dy = bounds.top + bounds.height - (b.top + b.height);
      o.set({ left: o.left + dx, top: o.top + dy });
      o.setCoords();
    }
    this.canvas.setActiveObject(multi ? new ActiveSelection(objs, { canvas: this.canvas }) : objs[0]);
    this.canvas.requestRenderAll();
    this.commit();
  }

  setBackground(bg: string | null, mode: 'commit' | 'debounce' = 'commit') {
    this.doc = { ...this.doc, background: bg };
    this.canvas.requestRenderAll();
    if (mode === 'commit') this.commit();
    else this.scheduleCommit();
    this.emit();
  }

  resizeDesign(w: number, h: number) {
    this.doc = { ...this.doc, width: clampDim(w), height: clampDim(h) };
    this.fit();
    this.commit();
  }

  // ---------------------------------------------------------------- adjustments
  getAdjustments(img: FabricImage): Record<Adjustment, number> {
    const out: Record<Adjustment, number> = { brightness: 0, contrast: 0, saturation: 0, blur: 0 };
    for (const f of img.filters) {
      if (f instanceof filters.Brightness) out.brightness = f.brightness;
      else if (f instanceof filters.Contrast) out.contrast = f.contrast;
      else if (f instanceof filters.Saturation) out.saturation = f.saturation;
      else if (f instanceof filters.Blur) out.blur = f.blur;
    }
    return out;
  }

  setAdjustments(img: FabricImage, values: Record<Adjustment, number>, mode: 'live' | 'commit') {
    const list = [];
    if (values.brightness) list.push(new filters.Brightness({ brightness: values.brightness }));
    if (values.contrast) list.push(new filters.Contrast({ contrast: values.contrast }));
    if (values.saturation) list.push(new filters.Saturation({ saturation: values.saturation }));
    if (values.blur) list.push(new filters.Blur({ blur: values.blur }));
    img.filters = list;
    img.applyFilters();
    this.canvas.requestRenderAll();
    if (mode === 'commit') this.commit();
    this.emit();
  }

  // ---------------------------------------------------------------- crop
  async startCrop(img: FabricImage) {
    if (this.crop || (img as any).locked) return;
    const el = img.getElement() as HTMLImageElement;
    const nw = el.naturalWidth || el.width;
    const nh = el.naturalHeight || el.height;
    const saved = {
      cropX: img.cropX,
      cropY: img.cropY,
      width: img.width,
      height: img.height,
      left: img.left,
      top: img.top,
      opacity: img.opacity,
    };
    const center = img.getCenterPoint();
    const off = new Point(img.cropX + img.width / 2 - nw / 2, img.cropY + img.height / 2 - nh / 2);
    const worldOff = util.transformPoint(off, img.calcTransformMatrix(), true);
    const frameW = img.width * img.scaleX;
    const frameH = img.height * img.scaleY;
    this.canvas.discardActiveObject();
    img.set({ cropX: 0, cropY: 0, width: nw, height: nh, selectable: false, evented: false });
    img.setPositionByOrigin(center.subtract(worldOff), 'center', 'center');
    img.setCoords();

    const frame = new Rect({
      width: frameW,
      height: frameH,
      angle: img.angle,
      fill: 'rgba(0,0,0,0)',
      stroke: '#ffffff',
      strokeWidth: 1.5,
      strokeUniform: true,
      strokeDashArray: [6, 4],
      excludeFromExport: true,
      lockRotation: true,
      lockScalingFlip: true,
      borderColor: ACCENT,
      cornerColor: '#ffffff',
      cornerStrokeColor: ACCENT,
      cornerStyle: 'rect',
      transparentCorners: false,
      cornerSize: 12,
      padding: 0,
    });
    frame.setControlsVisibility({ mtr: false });
    frame.setPositionByOrigin(center, 'center', 'center');
    this.canvas.add(frame);
    // the crop frame resizes freely; hold Shift to keep its proportions
    this.canvas.uniformScaling = false;
    this.crop = { img, frame, saved };
    this.canvas.setActiveObject(frame);
    this.canvas.requestRenderAll();
    this.emit();
  }

  private syncCropPreview() {
    if (this.crop) this.canvas.requestRenderAll();
  }

  applyCrop() {
    const c = this.crop;
    if (!c) return;
    const { img, frame } = c;
    const el = img.getElement() as HTMLImageElement;
    const nw = el.naturalWidth || el.width;
    const nh = el.naturalHeight || el.height;
    const inv = util.invertTransform(img.calcTransformMatrix());
    const pts = frame.getCoords().map((p) => util.transformPoint(p, inv));
    let minX = Math.max(-nw / 2, Math.min(...pts.map((p) => p.x)));
    let maxX = Math.min(nw / 2, Math.max(...pts.map((p) => p.x)));
    let minY = Math.max(-nh / 2, Math.min(...pts.map((p) => p.y)));
    let maxY = Math.min(nh / 2, Math.max(...pts.map((p) => p.y)));
    if (maxX - minX < 4) [minX, maxX] = [-nw / 2, nw / 2];
    if (maxY - minY < 4) [minY, maxY] = [-nh / 2, nh / 2];
    const centerLocal = new Point((minX + maxX) / 2, (minY + maxY) / 2);
    const centerWorld = util.transformPoint(centerLocal, img.calcTransformMatrix());
    this.endCropUi();
    img.set({
      cropX: minX + nw / 2,
      cropY: minY + nh / 2,
      width: maxX - minX,
      height: maxY - minY,
      opacity: c.saved.opacity as number,
      selectable: true,
      evented: true,
    });
    img.setPositionByOrigin(centerWorld, 'center', 'center');
    img.setCoords();
    this.canvas.setActiveObject(img);
    this.canvas.requestRenderAll();
    this.commit();
  }

  cancelCrop() {
    const c = this.crop;
    if (!c) return;
    this.endCropUi();
    c.img.set({ ...c.saved, selectable: true, evented: true } as any);
    c.img.setCoords();
    this.canvas.setActiveObject(c.img);
    this.canvas.requestRenderAll();
    this.emit();
  }

  resetCrop(img: FabricImage) {
    const el = img.getElement() as HTMLImageElement;
    const nw = el.naturalWidth || el.width;
    const nh = el.naturalHeight || el.height;
    const center = img.getCenterPoint();
    const off = new Point(img.cropX + img.width / 2 - nw / 2, img.cropY + img.height / 2 - nh / 2);
    const worldOff = util.transformPoint(off, img.calcTransformMatrix(), true);
    img.set({ cropX: 0, cropY: 0, width: nw, height: nh });
    img.setPositionByOrigin(center.subtract(worldOff), 'center', 'center');
    img.setCoords();
    this.canvas.requestRenderAll();
    this.commit();
  }

  private endCropUi() {
    const c = this.crop;
    if (!c) return;
    this.crop = null;
    this.canvas.uniformScaling = true;
    this.canvas.discardActiveObject();
    this.canvas.remove(c.frame);
  }

  // ---------------------------------------------------------------- export
  async exportImage(format: 'png' | 'jpeg', quality = 0.92) {
    if (this.crop) this.applyCrop();
    if (this.commitTimer !== undefined) this.commit();
    const snap = this.snapshot();
    const canvas = await renderScene(snap, { fallbackBackground: format === 'jpeg' ? '#ffffff' : undefined });
    const blob = await canvasToBlob(canvas, format === 'png' ? 'image/png' : 'image/jpeg', format === 'jpeg' ? quality : undefined);
    const name = `${safeFilename(this.doc.name)} ${snap.width}x${snap.height}.${format === 'png' ? 'png' : 'jpg'}`;
    downloadBlob(blob, name);
    return { blob, name, width: canvas.width, height: canvas.height };
  }

  isTypingInCanvas() {
    const a = this.canvas.getActiveObject();
    return !!a && !!(a as Textbox).isEditing;
  }
}
