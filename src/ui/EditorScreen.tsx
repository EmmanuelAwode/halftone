import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { FabricObject } from 'fabric';
import { EditorController } from '../editor/controller';
import { hydrate, downloadBlob, safeFilename } from '../editor/scene';
import { getProject } from '../lib/db';
import { loadAllFonts } from '../lib/fonts';
import { migrateProject } from '../lib/project';
import { ACCEPT_ATTR } from '../lib/assets';
import { buildBackup, BACKUP_EXT } from '../lib/backup';
import { Icon, Logo } from './icons';
import { IconButton } from './controls';
import { Inspector } from './Inspector';
import { LayersPanel } from './LayersPanel';
import { ToolRail, Drawer, type DrawerId } from './ToolRail';
import { ExportMenu } from './ExportMenu';
import { useToast } from './toast';

export function useEditor(ctl: EditorController) {
  return useSyncExternalStore(ctl.subscribe, ctl.getVersion);
}

function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function EditorScreen({ id, onExit }: { id: string; onExit: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ctl, setCtl] = useState<EditorController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    let instance: EditorController | null = null;
    const host = hostRef.current;
    (async () => {
      try {
        const raw = await getProject(id);
        if (!raw) throw new Error('This design no longer exists in this browser.');
        const doc = migrateProject(raw);
        await loadAllFonts();
        if (cancelled || !host) return;
        const el = document.createElement('canvas');
        host.appendChild(el);
        instance = new EditorController(el, host, doc);
        await instance.load(doc.objects, hydrate);
        if (cancelled) return;
        if (import.meta.env.DEV) (window as any).__halftone = instance;
        setCtl(instance);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      if (instance) {
        void instance.dispose().then(() => {
          if (host) host.innerHTML = '';
        });
      }
    };
  }, [id]);

  useEffect(() => {
    if (!ctl) return;
    ctl.onToast = toast;
    const flush = () => void ctl.flushSave();
    const onVis = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [ctl, toast]);

  if (error) {
    return (
      <div className="editor-error">
        <p>{error}</p>
        <button className="btn primary" onClick={onExit}>
          Back to designs
        </button>
      </div>
    );
  }

  return (
    <div className="editor">
      {ctl ? <TopBar ctl={ctl} onExit={onExit} /> : <div className="topbar" />}
      <div className="editor-body">
        {ctl ? <EditorChrome ctl={ctl} hostRef={hostRef} /> : null}
        {!ctl && <div className="stage-loading">Opening design…</div>}
        <div className={`stage ${ctl ? '' : 'hidden'}`}>
          <div className="stage-host" ref={hostRef} />
        </div>
        {ctl && <StageOverlays ctl={ctl} />}
      </div>
    </div>
  );
}

/** Keyboard shortcuts, drag-and-drop, paste, rails and side panels. */
function EditorChrome({ ctl, hostRef }: { ctl: EditorController; hostRef: React.RefObject<HTMLDivElement | null> }) {
  useEditor(ctl);
  const [drawer, setDrawer] = useState<DrawerId | null>('uploads');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoTarget = useRef<FabricObject | undefined>(undefined);

  useEffect(() => {
    ctl.onRequestPhoto = (target) => {
      photoTarget.current = target;
      fileRef.current?.click();
    };
  }, [ctl]);

  // keyboard shortcuts — never while typing in a field or a text layer
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || ctl.isTypingInCanvas()) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (e.code === 'Space') {
        ctl.setSpace(true);
        e.preventDefault();
        return;
      }
      if (mod && k === 'z' && !e.shiftKey) return void (e.preventDefault(), ctl.undo());
      if ((mod && k === 'z' && e.shiftKey) || (mod && k === 'y')) return void (e.preventDefault(), ctl.redo());
      if (mod && k === 'd') return void (e.preventDefault(), ctl.duplicate());
      if (mod && k === 'c') return void (ctl.copy() && e.preventDefault());
      if (mod && k === 'a') return void (e.preventDefault(), ctl.selectAll());
      if (mod && k === 's') return void (e.preventDefault(), ctl.flushSave());
      if (mod && (k === '=' || k === '+')) return void (e.preventDefault(), ctl.zoomBy(1.25));
      if (mod && k === '-') return void (e.preventDefault(), ctl.zoomBy(0.8));
      if (mod && k === '0') return void (e.preventDefault(), ctl.fit());
      if (mod && k === ']') return void (e.preventDefault(), ctl.arrange(e.shiftKey ? 'front' : 'forward'));
      if (mod && k === '[') return void (e.preventDefault(), ctl.arrange(e.shiftKey ? 'back' : 'backward'));
      if (mod) return;
      if (ctl.crop) {
        if (e.key === 'Enter') return void (e.preventDefault(), ctl.applyCrop());
        if (e.key === 'Escape') return void (e.preventDefault(), ctl.cancelCrop());
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') return void (e.preventDefault(), ctl.remove());
      if (e.key === 'Escape') return ctl.deselect();
      if (e.key.startsWith('Arrow')) {
        if (!ctl.selection().length) return;
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
        const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
        return ctl.nudge(dx, dy);
      }
      if (k === 't') return ctl.addText('heading');
      if (k === 'r') return ctl.addShape('rect');
      if (k === 'o') return ctl.addShape('ellipse');
      if (k === 'l') return ctl.addShape('line');
      if (k === 'c' && ctl.selection().length === 1 && ctl.selection()[0].type === 'image') {
        return void ctl.startCrop(ctl.selection()[0] as any);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') ctl.setSpace(false);
    };
    const blur = () => ctl.setSpace(false);
    const paste = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target) || ctl.isTypingInCanvas()) return;
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length) {
        e.preventDefault();
        void ctl.importFiles(files);
      } else if (ctl.hasClipboard()) {
        e.preventDefault();
        void ctl.paste();
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    window.addEventListener('paste', paste);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      window.removeEventListener('paste', paste);
    };
  }, [ctl]);

  // drag & drop onto the stage
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'copy';
      setDragOver(true);
    };
    const leave = (e: DragEvent) => {
      if (!host.contains(e.relatedTarget as Node)) setDragOver(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragOver(false);
      const r = host.getBoundingClientRect();
      void ctl.importFiles([...e.dataTransfer!.files], { viewportPoint: { x: e.clientX - r.left, y: e.clientY - r.top } });
    };
    host.addEventListener('dragover', over);
    host.addEventListener('dragleave', leave);
    host.addEventListener('drop', drop);
    return () => {
      host.removeEventListener('dragover', over);
      host.removeEventListener('dragleave', leave);
      host.removeEventListener('drop', drop);
    };
  }, [ctl, hostRef]);

  const pickPhotos = (target?: FabricObject) => {
    photoTarget.current = target;
    fileRef.current?.click();
  };

  return (
    <>
      <ToolRail active={drawer} onPick={(d) => setDrawer((cur) => (cur === d ? null : d))} />
      {drawer && <Drawer id={drawer} ctl={ctl} onPickPhotos={() => pickPhotos()} onClose={() => setDrawer(null)} />}
      <aside className="side">
        <Inspector ctl={ctl} onPickPhoto={pickPhotos} />
        <LayersPanel ctl={ctl} />
      </aside>
      {dragOver && <div className="drop-hint">Drop photos to add them{' '}— drop on a photo spot to fill it</div>}
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT_ATTR}
        multiple
        hidden
        data-testid="photo-input"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          const target = photoTarget.current;
          photoTarget.current = undefined;
          if (files.length) void ctl.importFiles(files, { target });
        }}
      />
    </>
  );
}

function StageOverlays({ ctl }: { ctl: EditorController }) {
  useEditor(ctl);
  return (
    <>
      {ctl.crop && (
        <div className="crop-bar" role="toolbar" aria-label="Crop">
          <Icon name="crop" />
          <span>Drag or resize the frame to crop</span>
          <button className="btn ghost sm" onClick={() => ctl.cancelCrop()}>
            Cancel <kbd>Esc</kbd>
          </button>
          <button className="btn primary sm" onClick={() => ctl.applyCrop()}>
            <Icon name="check" size={14} /> Apply <kbd>Enter</kbd>
          </button>
        </div>
      )}
      <div className="zoom-bar">
        <span className="dims">
          {ctl.doc.width} × {ctl.doc.height}
        </span>
        <IconButton icon="minus" title="Zoom out (Ctrl −)" onClick={() => ctl.zoomBy(0.8)} size={14} />
        <button className="zoom-pct" title="Fit to screen (Ctrl 0)" onClick={() => ctl.fit()}>
          {Math.round(ctl.zoom * 100)}%
        </button>
        <IconButton icon="plus" title="Zoom in (Ctrl +)" onClick={() => ctl.zoomBy(1.25)} size={14} />
        <IconButton icon="fit" title="Fit to screen (Ctrl 0)" onClick={() => ctl.fit()} size={14} />
        <span className="sep" />
        <IconButton
          icon="magnet"
          title={ctl.snapping ? 'Snapping guides on' : 'Snapping guides off'}
          active={ctl.snapping}
          onClick={() => {
            ctl.snapping = !ctl.snapping;
            ctl.deselect();
          }}
          size={14}
        />
      </div>
    </>
  );
}

function TopBar({ ctl, onExit }: { ctl: EditorController; onExit: () => void }) {
  useEditor(ctl);
  const [name, setName] = useState(ctl.doc.name);
  const [exportOpen, setExportOpen] = useState(false);
  const toast = useToast();
  useEffect(() => setName(ctl.doc.name), [ctl.doc.name]);
  const status =
    ctl.saveStatus === 'saved' ? 'Saved locally' : ctl.saveStatus === 'saving' ? 'Saving…' : ctl.saveStatus === 'error' ? 'Save failed' : 'Unsaved changes';
  return (
    <header className="topbar">
      <button
        className="home-btn"
        title="All designs"
        onClick={async () => {
          await ctl.flushSave();
          onExit();
        }}
      >
        <Icon name="back" size={14} />
        <Logo size={20} />
      </button>
      <input
        className="doc-name"
        value={name}
        aria-label="Design name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        onBlur={() => ctl.rename(name)}
      />
      <span className={`save-status ${ctl.saveStatus}`} title={ctl.lastError ?? undefined}>
        <i />
        {status}
      </span>
      <div className="topbar-mid">
        <IconButton icon="undo" title="Undo (Ctrl Z)" onClick={() => ctl.undo()} disabled={!ctl.canUndo} />
        <IconButton icon="redo" title="Redo (Ctrl Shift Z)" onClick={() => ctl.redo()} disabled={!ctl.canRedo} />
      </div>
      <div className="topbar-right">
        <button
          className="btn ghost"
          title="Download an editable backup including photos"
          onClick={async () => {
            await ctl.flushSave();
            downloadBlob(await buildBackup(ctl.doc.id), safeFilename(ctl.doc.name) + BACKUP_EXT);
            toast('Backup downloaded');
          }}
        >
          <Icon name="backup" /> Backup
        </button>
        <div className="export-wrap">
          <button className="btn primary" onClick={() => setExportOpen((v) => !v)} aria-expanded={exportOpen}>
            <Icon name="download" /> Export
          </button>
          {exportOpen && <ExportMenu ctl={ctl} onClose={() => setExportOpen(false)} />}
        </div>
      </div>
    </header>
  );
}
