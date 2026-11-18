import { useState } from 'react';
import type { FabricImage, FabricObject, Rect, Shadow, Textbox } from 'fabric';
import { ADJUSTMENTS, type Adjustment, type EditorController } from '../editor/controller';
import { displayName, kindOf } from '../editor/factories';
import { FONTS, WEIGHT_LABELS, fontDef } from '../lib/fonts';
import { SIZE_PRESETS } from '../lib/project';
import { ColorField, IconButton, NumberField, Row, Section, Segmented, Slider, Toggle } from './controls';
import { Icon } from './icons';
import { useEditor } from './EditorScreen';

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const colorOf = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

export function Inspector({ ctl, onPickPhoto }: { ctl: EditorController; onPickPhoto: (target?: FabricObject) => void }) {
  useEditor(ctl);
  const sel = ctl.selection();
  let body;
  if (ctl.crop) body = <CropPanel ctl={ctl} />;
  else if (sel.length === 0) body = <DesignPanel ctl={ctl} />;
  else if (sel.length > 1) body = <MultiPanel ctl={ctl} count={sel.length} />;
  else body = <ObjectPanel ctl={ctl} o={sel[0]} onPickPhoto={onPickPhoto} />;
  return (
    <div className="inspector" aria-label="Inspector">
      {body}
    </div>
  );
}

function CropPanel({ ctl }: { ctl: EditorController }) {
  return (
    <Section title="Crop photo">
      <p className="muted small">Move or resize the dashed frame. Everything outside it is hidden — the original photo is kept, so you can re-crop at any time.</p>
      <div className="btn-row">
        <button className="btn ghost" onClick={() => ctl.cancelCrop()}>
          Cancel
        </button>
        <button className="btn primary" onClick={() => ctl.applyCrop()}>
          <Icon name="check" size={14} /> Apply crop
        </button>
      </div>
    </Section>
  );
}

function DesignPanel({ ctl }: { ctl: EditorController }) {
  const [w, setW] = useState(ctl.doc.width);
  const [h, setH] = useState(ctl.doc.height);
  const [key, setKey] = useState(`${ctl.doc.width}x${ctl.doc.height}`);
  if (key !== `${ctl.doc.width}x${ctl.doc.height}`) {
    setKey(`${ctl.doc.width}x${ctl.doc.height}`);
    setW(ctl.doc.width);
    setH(ctl.doc.height);
  }
  const bg = ctl.doc.background;
  return (
    <>
      <Section title="Design">
        <Row label="Background">
          <ColorField
            label="Background"
            value={bg}
            onChange={(v, phase) => ctl.setBackground(v, phase === 'live' ? 'debounce' : 'commit')}
            allowNone
            onNone={() => ctl.setBackground(null)}
          />
        </Row>
        <Toggle checked={bg === null} onChange={(t) => ctl.setBackground(t ? null : '#ffffff')} label="Transparent background (PNG)" />
      </Section>
      <Section title="Size">
        <div className="grid2">
          <NumberField label="W" title="Width in px" value={w} min={16} max={8000} onCommit={setW} />
          <NumberField label="H" title="Height in px" value={h} min={16} max={8000} onCommit={setH} />
        </div>
        <div className="chip-row">
          {SIZE_PRESETS.map((p) => (
            <button
              key={p.id}
              className={`chip ${p.width === w && p.height === h ? 'on' : ''}`}
              onClick={() => {
                setW(p.width);
                setH(p.height);
              }}
              title={`${p.label} ${p.hint}`}
            >
              {p.label.split(' ')[0]} <span className="muted">{p.hint}</span>
            </button>
          ))}
        </div>
        <button className="btn ghost block" disabled={w === ctl.doc.width && h === ctl.doc.height} onClick={() => ctl.resizeDesign(w, h)}>
          Resize canvas to {w} × {h}
        </button>
        <p className="muted small">Resizing keeps layers where they are; reposition them afterwards.</p>
      </Section>
      <Section title="Tips">
        <ul className="tips">
          <li>Drop photos anywhere on the canvas.</li>
          <li>Double-click a photo to crop it.</li>
          <li>Hold Space and drag to pan; Ctrl + wheel to zoom.</li>
        </ul>
      </Section>
    </>
  );
}

function MultiPanel({ ctl, count }: { ctl: EditorController; count: number }) {
  return (
    <>
      <Section title={`${count} layers selected`}>
        <AlignButtons ctl={ctl} relative="selection" />
      </Section>
      <OpacitySection ctl={ctl} value={num(ctl.selection()[0].opacity, 1)} />
      <ActionsSection ctl={ctl} />
    </>
  );
}

function AlignButtons({ ctl, relative }: { ctl: EditorController; relative: 'page' | 'selection' }) {
  return (
    <div className="align-row" aria-label={`Align to ${relative}`}>
      <IconButton icon="alignLeft" title={`Align left (${relative})`} onClick={() => ctl.align('left')} />
      <IconButton icon="alignHCenter" title={`Align centre (${relative})`} onClick={() => ctl.align('hcenter')} />
      <IconButton icon="alignRight" title={`Align right (${relative})`} onClick={() => ctl.align('right')} />
      <IconButton icon="alignTop" title={`Align top (${relative})`} onClick={() => ctl.align('top')} />
      <IconButton icon="alignVCenter" title={`Align middle (${relative})`} onClick={() => ctl.align('vcenter')} />
      <IconButton icon="alignBottom" title={`Align bottom (${relative})`} onClick={() => ctl.align('bottom')} />
    </div>
  );
}

function OpacitySection({ ctl, value }: { ctl: EditorController; value: number }) {
  return (
    <Section title="Opacity">
      <Slider
        label="Opacity"
        value={value}
        min={0}
        max={1}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => ctl.update({ opacity: v }, 'live')}
        onCommit={() => ctl.commit()}
      />
    </Section>
  );
}

function ActionsSection({ ctl, o }: { ctl: EditorController; o?: FabricObject }) {
  const locked = !!(o as any)?.locked;
  return (
    <Section title="Arrange">
      <div className="align-row">
        <IconButton icon="toFront" title="Bring to front (Ctrl Shift ])" onClick={() => ctl.arrange('front')} />
        <IconButton icon="up" title="Bring forward (Ctrl ])" onClick={() => ctl.arrange('forward')} />
        <IconButton icon="down" title="Send backward (Ctrl [)" onClick={() => ctl.arrange('backward')} />
        <IconButton icon="toBack" title="Send to back (Ctrl Shift [)" onClick={() => ctl.arrange('back')} />
        <span className="sep" />
        <IconButton icon="copy" title="Duplicate (Ctrl D)" onClick={() => void ctl.duplicate()} />
        {o && (
          <IconButton
            icon={locked ? 'lock' : 'unlock'}
            title={locked ? 'Unlock' : 'Lock position'}
            active={locked}
            onClick={() => ctl.setLocked((o as any).id, !locked)}
          />
        )}
        <IconButton icon="trash" title="Delete (Del)" onClick={() => ctl.remove()} className="danger" />
      </div>
    </Section>
  );
}

function GeometrySection({ ctl, o }: { ctl: EditorController; o: FabricObject }) {
  const k = kindOf(o);
  const w = o.width * o.scaleX;
  const h = o.height * o.scaleY;
  return (
    <Section title="Position & size">
      <div className="grid2">
        <NumberField label="X" title="X position" value={o.left} onCommit={(v) => ctl.setGeometry(o, { left: v })} />
        <NumberField label="Y" title="Y position" value={o.top} onCommit={(v) => ctl.setGeometry(o, { top: v })} />
        <NumberField label="W" title="Width" value={w} min={1} onCommit={(v) => ctl.setGeometry(o, { width: v })} />
        {k !== 'text' && k !== 'line' ? (
          <NumberField label="H" title="Height" value={h} min={1} onCommit={(v) => ctl.setGeometry(o, { height: v })} />
        ) : (
          <span />
        )}
        <NumberField label="↻" title="Rotation in degrees" suffix="°" value={o.angle} onCommit={(v) => ctl.setGeometry(o, { angle: v })} />
      </div>
      <AlignButtons ctl={ctl} relative="page" />
    </Section>
  );
}

function ObjectPanel({ ctl, o, onPickPhoto }: { ctl: EditorController; o: FabricObject; onPickPhoto: (t?: FabricObject) => void }) {
  const k = kindOf(o);
  return (
    <>
      <div className="insp-title">
        <span className="kind-badge">{k === 'placeholder' ? 'Photo spot' : k}</span>
        <span className="insp-name">{displayName(o)}</span>
      </div>
      {k === 'placeholder' && (
        <Section title="Photo spot">
          <p className="muted small">Fill this spot with your own photo. It will be cropped to fit and keep this position in the layer stack.</p>
          <button className="btn primary block" onClick={() => onPickPhoto(o)}>
            <Icon name="image" /> Add photo…
          </button>
        </Section>
      )}
      {k === 'image' && <ImageSections ctl={ctl} img={o as FabricImage} onPickPhoto={onPickPhoto} />}
      {k === 'text' && <TextSections ctl={ctl} t={o as Textbox} />}
      {(k === 'rect' || k === 'ellipse') && <ShapeSection ctl={ctl} o={o} />}
      {k === 'line' && <LineSection ctl={ctl} o={o} />}
      <OpacitySection ctl={ctl} value={num(o.opacity, 1)} />
      <GeometrySection ctl={ctl} o={o} />
      <ActionsSection ctl={ctl} o={o} />
    </>
  );
}

function ImageSections({ ctl, img, onPickPhoto }: { ctl: EditorController; img: FabricImage; onPickPhoto: (t?: FabricObject) => void }) {
  const adj = ctl.getAdjustments(img);
  const isAdjusted = Object.values(adj).some((v) => v !== 0);
  const el = img.getElement() as HTMLImageElement;
  const cropped = img.cropX > 0.5 || img.cropY > 0.5 || img.width < (el.naturalWidth || el.width) - 0.5 || img.height < (el.naturalHeight || el.height) - 0.5;
  const set = (key: Adjustment, v: number, mode: 'live' | 'commit') => ctl.setAdjustments(img, { ...adj, [key]: v }, mode);
  return (
    <>
      <Section title="Photo">
        <div className="btn-grid">
          <button className="btn ghost" onClick={() => void ctl.startCrop(img)} disabled={!!(img as any).locked}>
            <Icon name="crop" size={14} /> Crop
          </button>
          <button className="btn ghost" onClick={() => ctl.resetCrop(img)} disabled={!cropped}>
            <Icon name="reset" size={14} /> Uncrop
          </button>
          <button className="btn ghost" onClick={() => ctl.fillCanvas(img)}>
            <Icon name="fit" size={14} /> Fill canvas
          </button>
          <button className="btn ghost" onClick={() => onPickPhoto(img)}>
            <Icon name="image" size={14} /> Replace
          </button>
        </div>
      </Section>
      <Section
        title="Adjust"
        actions={
          <button className="link-btn" disabled={!isAdjusted} onClick={() => ctl.setAdjustments(img, { brightness: 0, contrast: 0, saturation: 0, blur: 0 }, 'commit')}>
            <Icon name="reset" size={12} /> Reset
          </button>
        }
      >
        {ADJUSTMENTS.map((a) => (
          <Slider
            key={a.key}
            label={a.label}
            value={adj[a.key]}
            min={a.min}
            max={a.max}
            step={0.01}
            onChange={(v) => set(a.key, v, 'live')}
            onCommit={() => ctl.commit()}
          />
        ))}
      </Section>
    </>
  );
}

function normWeight(w: unknown): number {
  if (w === 'bold') return 700;
  if (w === 'normal' || w === undefined) return 400;
  const n = Number(w);
  return Number.isFinite(n) ? n : 400;
}

function TextSections({ ctl, t }: { ctl: EditorController; t: Textbox }) {
  const family = t.fontFamily;
  const def = fontDef(family);
  const weights = def?.weights ?? [400, 700];
  const weight = normWeight(t.fontWeight);
  const stroke = colorOf(t.stroke);
  const strokeW = num(t.strokeWidth);
  const outlined = !!stroke && strokeW > 0;
  const shadow = t.shadow as Shadow | null;
  const fs = t.fontSize;
  return (
    <>
      <Section title="Text">
        <Row label="Font">
          <select
            value={family}
            aria-label="Font family"
            style={{ fontFamily: family }}
            onChange={(e) => {
              const nd = fontDef(e.target.value);
              const nextW = nd && !nd.weights.includes(weight) ? nd.weights.reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a)) : weight;
              ctl.update({ fontFamily: e.target.value, fontWeight: nextW });
            }}
          >
            {!def && <option value={family}>{family}</option>}
            {FONTS.map((f) => (
              <option key={f.family} value={f.family} style={{ fontFamily: f.family }}>
                {f.family}
              </option>
            ))}
          </select>
        </Row>
        <div className="grid2">
          <select value={weight} aria-label="Font weight" onChange={(e) => ctl.update({ fontWeight: Number(e.target.value) })}>
            {weights.map((w) => (
              <option key={w} value={w}>
                {WEIGHT_LABELS[w] ?? w}
              </option>
            ))}
          </select>
          <NumberField label="Size" title="Font size" value={fs} min={4} max={2000} decimals={1} onCommit={(v) => ctl.update({ fontSize: v })} />
        </div>
        <div className="grid2">
          <Segmented
            label="Alignment"
            value={t.textAlign as 'left' | 'center' | 'right' | 'justify'}
            onChange={(v) => ctl.update({ textAlign: v })}
            options={[
              { value: 'left', icon: 'textLeft', title: 'Align left' },
              { value: 'center', icon: 'textCenter', title: 'Align centre' },
              { value: 'right', icon: 'textRight', title: 'Align right' },
              { value: 'justify', icon: 'textJustify', title: 'Justify' },
            ]}
          />
          <div className="btn-pair">
            <button className={`btn ghost sm ${t.fontStyle === 'italic' ? 'on' : ''}`} title="Italic" onClick={() => ctl.update({ fontStyle: t.fontStyle === 'italic' ? 'normal' : 'italic' })}>
              <i>I</i>
            </button>
            <button className="btn ghost sm" title="Convert to UPPERCASE" onClick={() => ctl.update({ text: t.text.toUpperCase() })}>
              AA
            </button>
          </div>
        </div>
        <Row label="Colour">
          <ColorField label="Text" value={colorOf(t.fill)} onChange={(v, p) => ctl.update({ fill: v }, p === 'live' ? 'debounce' : 'commit')} />
        </Row>
        <button className="btn ghost block" title="Make this a large, outlined, high-contrast title" onClick={() => {
          const base = Math.min(ctl.doc.width, ctl.doc.height);
          ctl.update({ fontFamily: 'Anton', fontWeight: 400, fontSize: Math.round(base * 0.2), stroke: '#111111', strokeWidth: Math.max(4, Math.round(base * 0.016)), paintFirst: 'stroke', strokeLineJoin: 'round', lineHeight: 0.95 }, 'live');
          ctl.setShadow(true, { color: 'rgba(0,0,0,0.6)', blur: Math.round(base * 0.02), offsetX: 0, offsetY: Math.round(base * 0.008) });
        }}>
          Make it a thumbnail title
        </button>
        <Slider label="Letter spacing" value={num(t.charSpacing)} min={-100} max={800} step={5} format={(v) => String(Math.round(v))} onChange={(v) => ctl.update({ charSpacing: v }, 'live')} onCommit={() => ctl.commit()} />
        <Slider label="Line height" value={num(t.lineHeight, 1)} min={0.6} max={2.5} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => ctl.update({ lineHeight: v }, 'live')} onCommit={() => ctl.commit()} />
      </Section>
      <Section title="Outline" actions={<Toggle label="" checked={outlined} onChange={(on) => ctl.update(on ? { stroke: stroke ?? '#111111', strokeWidth: Math.max(2, Math.round(fs * 0.08)), paintFirst: 'stroke', strokeLineJoin: 'round' } : { strokeWidth: 0 })} />}>
        {outlined && (
          <>
            <Row label="Colour">
              <ColorField label="Outline" value={stroke} onChange={(v, p) => ctl.update({ stroke: v }, p === 'live' ? 'debounce' : 'commit')} />
            </Row>
            <Slider label="Thickness" value={strokeW} min={0} max={Math.max(20, Math.round(fs * 0.3))} step={0.5} format={(v) => v.toFixed(1)} onChange={(v) => ctl.update({ strokeWidth: v }, 'live')} onCommit={() => ctl.commit()} />
          </>
        )}
      </Section>
      <ShadowSection ctl={ctl} shadow={shadow} scale={fs} />
    </>
  );
}

function ShadowSection({ ctl, shadow, scale }: { ctl: EditorController; shadow: Shadow | null; scale: number }) {
  const max = Math.max(40, Math.round(scale * 0.5));
  return (
    <Section title="Shadow" actions={<Toggle label="" checked={!!shadow} onChange={(on) => ctl.setShadow(on)} />}>
      {shadow && (
        <>
          <Row label="Colour">
            <ColorField label="Shadow" value={shadow.color} onChange={(v, p) => ctl.setShadow(true, { color: v }, p === 'live' ? 'debounce' : 'commit')} />
          </Row>
          <Slider label="Blur" value={shadow.blur} min={0} max={max} step={1} format={(v) => String(Math.round(v))} onChange={(v) => ctl.setShadow(true, { blur: v }, 'live')} onCommit={() => ctl.commit()} />
          <Slider label="Offset X" value={shadow.offsetX} min={-max} max={max} step={1} format={(v) => String(Math.round(v))} onChange={(v) => ctl.setShadow(true, { offsetX: v }, 'live')} onCommit={() => ctl.commit()} />
          <Slider label="Offset Y" value={shadow.offsetY} min={-max} max={max} step={1} format={(v) => String(Math.round(v))} onChange={(v) => ctl.setShadow(true, { offsetY: v }, 'live')} onCommit={() => ctl.commit()} />
        </>
      )}
    </Section>
  );
}

function ShapeSection({ ctl, o }: { ctl: EditorController; o: FabricObject }) {
  const fill = colorOf(o.fill);
  const stroke = colorOf(o.stroke);
  const sw = num(o.strokeWidth);
  const isRect = kindOf(o) === 'rect';
  const r = o as Rect;
  const maxR = Math.round(Math.min(r.width, r.height) / 2);
  const gradient = o.fill && typeof o.fill === 'object';
  return (
    <>
      <Section title="Fill">
        <Row label="Colour">
          {gradient ? (
            <button className="btn ghost sm" onClick={() => ctl.update({ fill: '#ff6b35' })}>
              Gradient — replace with colour
            </button>
          ) : (
            <ColorField label="Fill" value={fill} allowNone onNone={() => ctl.update({ fill: '' })} onChange={(v, p) => ctl.update({ fill: v }, p === 'live' ? 'debounce' : 'commit')} />
          )}
        </Row>
        {isRect && (
          <Slider label="Corner radius" value={num(r.rx)} min={0} max={maxR} step={1} format={(v) => String(Math.round(v))} onChange={(v) => ctl.update({ rx: v, ry: v }, 'live')} onCommit={() => ctl.commit()} />
        )}
      </Section>
      <Section title="Stroke">
        <Row label="Colour">
          <ColorField
            label="Stroke"
            value={sw > 0 ? stroke : null}
            allowNone
            onNone={() => ctl.update({ strokeWidth: 0 })}
            onChange={(v, p) => ctl.update({ stroke: v, strokeWidth: sw > 0 ? sw : Math.max(2, Math.round(Math.min(ctl.doc.width, ctl.doc.height) * 0.006)) }, p === 'live' ? 'debounce' : 'commit')}
          />
        </Row>
        <Slider label="Width" value={sw} min={0} max={Math.max(40, Math.round(Math.min(ctl.doc.width, ctl.doc.height) * 0.05))} step={1} format={(v) => String(Math.round(v))} onChange={(v) => ctl.update({ strokeWidth: v }, 'live')} onCommit={() => ctl.commit()} />
      </Section>
    </>
  );
}

function LineSection({ ctl, o }: { ctl: EditorController; o: FabricObject }) {
  const sw = num(o.strokeWidth);
  return (
    <Section title="Line">
      <Row label="Colour">
        <ColorField label="Line" value={colorOf(o.stroke)} onChange={(v, p) => ctl.update({ stroke: v }, p === 'live' ? 'debounce' : 'commit')} />
      </Row>
      <Slider label="Thickness" value={sw} min={1} max={Math.max(40, Math.round(Math.min(ctl.doc.width, ctl.doc.height) * 0.05))} step={1} format={(v) => String(Math.round(v))} onChange={(v) => ctl.update({ strokeWidth: v }, 'live')} onCommit={() => ctl.commit()} />
      <Segmented
        label="Line ends"
        value={o.strokeLineCap as 'round' | 'butt'}
        onChange={(v) => ctl.update({ strokeLineCap: v })}
        options={[
          { value: 'round', label: 'Round', title: 'Rounded ends' },
          { value: 'butt', label: 'Square', title: 'Square ends' },
        ]}
      />
    </Section>
  );
}
