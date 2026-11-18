import { useState } from 'react';
import type { EditorController, LayerInfo } from '../editor/controller';
import { Icon, type IconName } from './icons';
import { useEditor } from './EditorScreen';

const KIND_ICON: Record<LayerInfo['kind'], IconName> = {
  image: 'image',
  text: 'text',
  rect: 'rect',
  ellipse: 'ellipse',
  line: 'line',
  placeholder: 'frame',
  group: 'group',
  other: 'shapes',
};

export function LayersPanel({ ctl }: { ctl: EditorController }) {
  useEditor(ctl);
  const layers = ctl.layers();
  const n = layers.length;
  const [editing, setEditing] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  // display row i (top first) <-> stacking index n-1-i
  const moveToRow = (id: string, row: number) => ctl.moveLayer(id, n - 1 - row);

  return (
    <section className="layers" aria-label="Layers">
      <header>
        <h3>Layers</h3>
        <span className="muted small">{n}</span>
      </header>
      {n === 0 && <p className="muted small pad">No layers yet. Add a photo, text or shape from the left.</p>}
      <ol className="layer-list" onDragLeave={() => setDropAt(null)}>
        {layers.map((l, i) => (
          <li
            key={l.id}
            className={`layer ${l.selected ? 'sel' : ''} ${l.visible ? '' : 'hidden-layer'} ${dragId === l.id ? 'dragging' : ''} ${dropAt === i ? 'drop-before' : ''} ${dropAt === i + 1 && i === n - 1 ? 'drop-after' : ''}`}
            draggable={editing !== l.id}
            onDragStart={(e) => {
              setDragId(l.id);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/x-layer', l.id);
            }}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              setDropAt(e.clientY < r.top + r.height / 2 ? i : i + 1);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId && dropAt !== null) {
                const from = layers.findIndex((x) => x.id === dragId);
                const target = dropAt > from ? dropAt - 1 : dropAt;
                if (target !== from) moveToRow(dragId, target);
              }
              setDragId(null);
              setDropAt(null);
            }}
            onDragEnd={() => {
              setDragId(null);
              setDropAt(null);
            }}
            onClick={(e) => ctl.select(l.id, e.shiftKey || e.ctrlKey || e.metaKey)}
          >
            <span className="layer-grip" aria-hidden="true">
              <Icon name="grip" size={12} />
            </span>
            <Icon name={KIND_ICON[l.kind]} size={14} className="layer-kind" />
            {editing === l.id ? (
              <input
                className="layer-rename"
                autoFocus
                defaultValue={l.name}
                aria-label="Layer name"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') setEditing(null);
                }}
                onBlur={(e) => {
                  setEditing(null);
                  if (e.target.value.trim() !== l.name) ctl.renameLayer(l.id, e.target.value);
                }}
              />
            ) : (
              <span className="layer-name" onDoubleClick={() => setEditing(l.id)} title="Double-click to rename">
                {l.name}
              </span>
            )}
            <span className="layer-actions" onClick={(e) => e.stopPropagation()}>
              <button className="icon-btn xs" title="Rename" aria-label={`Rename ${l.name}`} onClick={() => setEditing(l.id)}>
                <Icon name="edit" size={12} />
              </button>
              <button className="icon-btn xs" title="Move up" aria-label={`Move ${l.name} up`} disabled={i === 0} onClick={() => moveToRow(l.id, i - 1)}>
                <Icon name="up" size={12} />
              </button>
              <button className="icon-btn xs" title="Move down" aria-label={`Move ${l.name} down`} disabled={i === n - 1} onClick={() => moveToRow(l.id, i + 1)}>
                <Icon name="down" size={12} />
              </button>
              <button
                className={`icon-btn xs ${l.locked ? 'active' : ''}`}
                title={l.locked ? 'Unlock' : 'Lock'}
                aria-label={`${l.locked ? 'Unlock' : 'Lock'} ${l.name}`}
                aria-pressed={l.locked}
                onClick={() => ctl.setLocked(l.id, !l.locked)}
              >
                <Icon name={l.locked ? 'lock' : 'unlock'} size={12} />
              </button>
              <button
                className={`icon-btn xs ${l.visible ? '' : 'active'}`}
                title={l.visible ? 'Hide' : 'Show'}
                aria-label={`${l.visible ? 'Hide' : 'Show'} ${l.name}`}
                aria-pressed={!l.visible}
                onClick={() => ctl.setVisible(l.id, !l.visible)}
              >
                <Icon name={l.visible ? 'eye' : 'eyeOff'} size={12} />
              </button>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
