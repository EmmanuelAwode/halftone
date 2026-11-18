import {
  Ellipse,
  FabricObject,
  Gradient,
  Group,
  Line,
  Rect,
  Shadow,
  Textbox,
  config,
  type TFiller,
} from 'fabric';
import { uid } from '../lib/project';

// --- one-time Fabric configuration ---------------------------------------
FabricObject.customProperties = ['id', 'name', 'assetId', 'placeholder', 'locked'];
config.configure({ textureSize: 4096 });

export type Kind = 'image' | 'text' | 'rect' | 'ellipse' | 'line' | 'placeholder' | 'group' | 'other';

export function kindOf(o: FabricObject): Kind {
  if ((o as any).placeholder) return 'placeholder';
  switch (o.type) {
    case 'image':
      return 'image';
    case 'textbox':
    case 'i-text':
    case 'text':
      return 'text';
    case 'rect':
      return 'rect';
    case 'ellipse':
    case 'circle':
      return 'ellipse';
    case 'line':
      return 'line';
    case 'group':
      return 'group';
    default:
      return 'other';
  }
}

const KIND_NAMES: Record<Kind, string> = {
  image: 'Photo',
  text: 'Text',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  line: 'Line',
  placeholder: 'Photo spot',
  group: 'Group',
  other: 'Object',
};

export function displayName(o: FabricObject): string {
  const n = (o as any).name as string | undefined;
  if (n) return n;
  if (kindOf(o) === 'text') {
    const t = ((o as Textbox).text || '').replace(/\s+/g, ' ').trim();
    return t ? t.slice(0, 28) : 'Text';
  }
  return KIND_NAMES[kindOf(o)];
}

export function ensureId(o: FabricObject) {
  if (!(o as any).id) (o as any).id = uid('o_');
}

// --- text ----------------------------------------------------------------
export type TextPreset = 'headline' | 'heading' | 'subheading' | 'body';

export const TEXT_PRESETS: { id: TextPreset; label: string; sample: string }[] = [
  { id: 'headline', label: 'Thumbnail headline', sample: 'BIG BOLD TITLE' },
  { id: 'heading', label: 'Heading', sample: 'Add a heading' },
  { id: 'subheading', label: 'Subheading', sample: 'Add a subheading' },
  { id: 'body', label: 'Body text', sample: 'Add a little body text' },
];

/** Text sized relative to the design so it reads well on any canvas. */
export function makeText(preset: TextPreset, designW: number, designH: number, text?: string): Textbox {
  const base = Math.min(designW, designH);
  const common = {
    originX: 'left' as const,
    originY: 'top' as const,
    paintFirst: 'stroke' as const,
    strokeLineJoin: 'round' as const,
    strokeUniform: false,
    textAlign: 'center',
    lineHeight: 1.05,
    splitByGrapheme: false,
  };
  let t: Textbox;
  switch (preset) {
    case 'headline':
      t = new Textbox(text ?? 'BIG BOLD TITLE', {
        ...common,
        fontFamily: 'Anton',
        fontWeight: 400,
        fontSize: Math.round(base * 0.2),
        fill: '#ffffff',
        stroke: '#111111',
        strokeWidth: Math.max(4, Math.round(base * 0.016)),
        width: designW * 0.8,
        shadow: new Shadow({ color: 'rgba(0,0,0,0.55)', blur: Math.round(base * 0.02), offsetX: 0, offsetY: Math.round(base * 0.008) }),
      });
      break;
    case 'heading':
      t = new Textbox(text ?? 'Add a heading', {
        ...common,
        fontFamily: 'Inter',
        fontWeight: 800,
        fontSize: Math.round(base * 0.1),
        fill: '#111111',
        width: designW * 0.7,
        lineHeight: 1.1,
      });
      break;
    case 'subheading':
      t = new Textbox(text ?? 'Add a subheading', {
        ...common,
        fontFamily: 'Inter',
        fontWeight: 600,
        fontSize: Math.round(base * 0.055),
        fill: '#222222',
        width: designW * 0.6,
        lineHeight: 1.15,
      });
      break;
    default:
      t = new Textbox(text ?? 'Add a little body text', {
        ...common,
        fontFamily: 'Inter',
        fontWeight: 400,
        fontSize: Math.round(base * 0.035),
        fill: '#333333',
        width: designW * 0.5,
        lineHeight: 1.3,
      });
  }
  ensureId(t);
  return t;
}

// --- shapes --------------------------------------------------------------
export function makeRect(designW: number, designH: number, opts: Partial<Rect> = {}): Rect {
  const s = Math.min(designW, designH) * 0.35;
  const r = new Rect({
    left: (designW - s) / 2,
    top: (designH - s) / 2,
    width: s,
    height: s,
    fill: '#ff6b35',
    stroke: '#111111',
    strokeWidth: 0,
    strokeUniform: true,
    rx: 0,
    ry: 0,
    ...opts,
  });
  ensureId(r);
  return r;
}

export function makeEllipse(designW: number, designH: number, opts: Partial<Ellipse> = {}): Ellipse {
  const s = Math.min(designW, designH) * 0.35;
  const e = new Ellipse({
    left: (designW - s) / 2,
    top: (designH - s) / 2,
    rx: s / 2,
    ry: s / 2,
    fill: '#3d7bff',
    stroke: '#111111',
    strokeWidth: 0,
    strokeUniform: true,
    ...opts,
  });
  ensureId(e);
  return e;
}

export function makeLine(
  designW: number,
  designH: number,
  opts: Partial<Line> = {},
  points?: [number, number, number, number],
): Line {
  const len = designW * 0.4;
  const y = designH / 2;
  const l = new Line(points ?? [designW / 2 - len / 2, y, designW / 2 + len / 2, y], {
    stroke: '#111111',
    strokeWidth: Math.max(4, Math.round(Math.min(designW, designH) * 0.008)),
    strokeLineCap: 'round',
    strokeUniform: true,
    fill: '',
    ...opts,
  });
  ensureId(l);
  return l;
}

// --- photo placeholder ---------------------------------------------------
export function makePlaceholder(left: number, top: number, w: number, h: number, label = 'Drop a photo here'): Group {
  const box = new Rect({
    left: 0,
    top: 0,
    width: w,
    height: h,
    fill: '#2a2c31',
    stroke: '#8a8f99',
    strokeWidth: Math.max(2, Math.round(Math.min(w, h) * 0.008)),
    strokeDashArray: [Math.min(w, h) * 0.03, Math.min(w, h) * 0.02],
    strokeUniform: true,
  });
  const fontSize = Math.max(14, Math.round(Math.min(w, h) * 0.07));
  const text = new Textbox(label, {
    left: w * 0.1,
    top: h / 2 - fontSize * 0.6,
    width: w * 0.8,
    fontSize,
    fontFamily: 'Inter',
    fontWeight: 600,
    fill: '#c9ccd3',
    textAlign: 'center',
  });
  const g = new Group([box, text], { left, top, subTargetCheck: false, interactive: false });
  (g as any).placeholder = true;
  (g as any).name = 'Photo spot';
  ensureId(g);
  return g;
}

export function linearGradient(h: number, stops: [number, string][]): TFiller {
  return new Gradient({
    type: 'linear',
    gradientUnits: 'pixels',
    coords: { x1: 0, y1: 0, x2: 0, y2: h },
    colorStops: stops.map(([offset, color]) => ({ offset, color })),
  });
}
