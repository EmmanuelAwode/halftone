import { useEffect, useRef, useState } from 'react';
import type { EditorController } from '../editor/controller';
import { Segmented, Slider } from './controls';
import { Icon } from './icons';
import { useToast } from './toast';

export function ExportMenu({ ctl, onClose }: { ctl: EditorController; onClose: () => void }) {
  const [format, setFormat] = useState<'png' | 'jpeg'>('png');
  const [quality, setQuality] = useState(0.92);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const toast = useToast();
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.parentElement!.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  const transparent = ctl.doc.background === null;
  return (
    <div className="popover export-menu" ref={ref} role="dialog" aria-label="Export">
      <h4>Export image</h4>
      <p className="muted small">
        Exactly {ctl.doc.width} × {ctl.doc.height} px, independent of zoom.
      </p>
      <Segmented
        label="File type"
        value={format}
        onChange={setFormat}
        options={[
          { value: 'png', label: 'PNG', title: 'PNG — lossless' + (transparent ? ', transparent background' : '') },
          { value: 'jpeg', label: 'JPEG', title: 'JPEG — smaller files' },
        ]}
      />
      {format === 'jpeg' && (
        <Slider label="Quality" value={quality} min={0.5} max={1} step={0.01} onChange={setQuality} onCommit={() => {}} />
      )}
      <p className="muted small">
        {format === 'png'
          ? transparent
            ? 'Background is transparent — the PNG keeps transparency.'
            : 'Tip: set the background to transparent for a cut-out PNG.'
          : transparent
            ? 'JPEG has no transparency; empty areas become white.'
            : 'Best for photos and uploads with size limits.'}
      </p>
      <button
        className="btn primary block"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await ctl.exportImage(format, quality);
            toast(`Exported ${r.name} (${r.width} × ${r.height})`);
            onClose();
          } catch (e) {
            toast(e instanceof Error ? e.message : String(e), 'error');
          } finally {
            setBusy(false);
          }
        }}
      >
        <Icon name="download" /> {busy ? 'Rendering…' : `Download ${format === 'png' ? 'PNG' : 'JPEG'}`}
      </button>
    </div>
  );
}
