import { useEffect, useState } from 'react';
import type { EditorController } from '../editor/controller';
import { kindOf, TEXT_PRESETS } from '../editor/factories';
import { listAssets, type AssetRecord } from '../lib/db';
import { assetUrl } from '../lib/assets';
import { Icon, type IconName } from './icons';

export type DrawerId = 'uploads' | 'text' | 'shapes';

const ITEMS: { id: DrawerId; icon: IconName; label: string }[] = [
  { id: 'uploads', icon: 'upload', label: 'Photos' },
  { id: 'text', icon: 'text', label: 'Text' },
  { id: 'shapes', icon: 'shapes', label: 'Shapes' },
];

export function ToolRail({ active, onPick }: { active: DrawerId | null; onPick: (d: DrawerId) => void }) {
  return (
    <nav className="rail" aria-label="Add content">
      {ITEMS.map((it) => (
        <button key={it.id} className={`rail-btn ${active === it.id ? 'on' : ''}`} onClick={() => onPick(it.id)} aria-pressed={active === it.id}>
          <Icon name={it.icon} size={19} />
          <span>{it.label}</span>
        </button>
      ))}
      <div className="rail-spacer" />
      <ShortcutHelp />
    </nav>
  );
}

function ShortcutHelp() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rail-help">
      <button className="rail-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open} title="Keyboard shortcuts">
        <span className="kbd-glyph">?</span>
        <span>Keys</span>
      </button>
      {open && (
        <div className="popover shortcuts" role="dialog" aria-label="Keyboard shortcuts">
          <h4>Shortcuts</h4>
          <dl>
            {[
              ['Undo / Redo', 'Ctrl Z / Ctrl Shift Z'],
              ['Duplicate', 'Ctrl D'],
              ['Copy / Paste', 'Ctrl C / Ctrl V'],
              ['Delete', 'Del / Backspace'],
              ['Nudge', 'Arrows (Shift ×10)'],
              ['Crop selected photo', 'C or double-click'],
              ['Add text / rect / ellipse / line', 'T / R / O / L'],
              ['Bring forward / back', 'Ctrl ] / Ctrl ['],
              ['Zoom', 'Ctrl + / Ctrl − / Ctrl wheel'],
              ['Fit to screen', 'Ctrl 0'],
              ['Pan', 'Wheel, or Space + drag'],
              ['Keep proportions off', 'Hold Shift while scaling'],
            ].map(([a, b]) => (
              <div key={a}>
                <dt>{a}</dt>
                <dd>{b}</dd>
              </div>
            ))}
          </dl>
          <p className="muted">Shortcuts pause while you type in a field or a text layer.</p>
        </div>
      )}
    </div>
  );
}

export function Drawer({
  id,
  ctl,
  onPickPhotos,
  onClose,
}: {
  id: DrawerId;
  ctl: EditorController;
  onPickPhotos: () => void;
  onClose: () => void;
}) {
  return (
    <aside className="drawer" aria-label={ITEMS.find((i) => i.id === id)?.label}>
      <header>
        <h2>{ITEMS.find((i) => i.id === id)?.label}</h2>
        <button className="icon-btn sm" onClick={onClose} title="Close panel" aria-label="Close panel">
          <Icon name="x" size={14} />
        </button>
      </header>
      {id === 'uploads' && <UploadsDrawer ctl={ctl} onPick={onPickPhotos} />}
      {id === 'text' && <TextDrawer ctl={ctl} />}
      {id === 'shapes' && <ShapesDrawer ctl={ctl} />}
    </aside>
  );
}

function UploadsDrawer({ ctl, onPick }: { ctl: EditorController; onPick: () => void }) {
  const [assets, setAssets] = useState<(AssetRecord & { url?: string })[]>([]);
  const imageKey = ctl.objects().filter((o) => o.type === 'image').map((o) => (o as any).assetId).join(',');
  useEffect(() => {
    let live = true;
    listAssets().then(async (list) => {
      const withUrls = await Promise.all(list.slice(0, 60).map(async (a) => ({ ...a, url: await assetUrl(a.id) })));
      if (live) setAssets(withUrls);
    });
    return () => {
      live = false;
    };
    // refresh when the set of photos in the design changes (e.g. after an import)
  }, [imageKey]);
  const sel = ctl.selection();
  const frame = sel.length === 1 && (kindOf(sel[0]) === 'placeholder' || kindOf(sel[0]) === 'image') ? sel[0] : undefined;
  return (
    <div className="drawer-body">
      <button className="btn primary block" onClick={onPick}>
        <Icon name="upload" /> Upload photos
      </button>
      <p className="muted small">PNG, JPEG or WebP. You can also drag files onto the canvas or paste with Ctrl V.</p>
      {assets.length > 0 && (
        <>
          <h3 className="drawer-sub">Recent photos {frame && <span className="muted">· click to fill selection</span>}</h3>
          <div className="asset-grid">
            {assets.map((a) => (
              <button key={a.id} className="asset" title={a.name} onClick={() => ctl.addAsset(a, frame)}>
                {a.url && <img src={a.url} alt={a.name} loading="lazy" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TextDrawer({ ctl }: { ctl: EditorController }) {
  const styles: Record<string, React.CSSProperties> = {
    headline: { fontFamily: 'Anton', fontSize: 26, color: '#fff', WebkitTextStroke: '1px #000', textShadow: '0 2px 6px rgba(0,0,0,.6)', letterSpacing: '.01em' },
    heading: { fontFamily: 'Inter', fontWeight: 800, fontSize: 20 },
    subheading: { fontFamily: 'Inter', fontWeight: 600, fontSize: 15 },
    body: { fontFamily: 'Inter', fontWeight: 400, fontSize: 13 },
  };
  return (
    <div className="drawer-body">
      {TEXT_PRESETS.map((p) => (
        <button key={p.id} className={`text-preset ${p.id}`} onClick={() => ctl.addText(p.id)}>
          <span style={styles[p.id]}>{p.sample}</span>
          <small>{p.label}</small>
        </button>
      ))}
      <p className="muted small">Double-click text on the canvas to edit it. Thumbnail headlines come with an outline and shadow so they stay readable at small sizes.</p>
    </div>
  );
}

function ShapesDrawer({ ctl }: { ctl: EditorController }) {
  return (
    <div className="drawer-body">
      <div className="shape-grid">
        <button className="shape-btn" onClick={() => ctl.addShape('rect')}>
          <Icon name="rect" size={30} />
          <span>Rectangle</span>
        </button>
        <button className="shape-btn" onClick={() => ctl.addShape('ellipse')}>
          <Icon name="ellipse" size={30} />
          <span>Circle</span>
        </button>
        <button className="shape-btn" onClick={() => ctl.addShape('line')}>
          <Icon name="line" size={30} />
          <span>Line</span>
        </button>
        <button className="shape-btn" onClick={() => void ctl.addPlaceholder()}>
          <Icon name="frame" size={30} />
          <span>Photo spot</span>
        </button>
      </div>
      <p className="muted small">Photo spots mark where a photo goes. Drop or pick a photo on one to fill it — they are left out of exports.</p>
    </div>
  );
}
