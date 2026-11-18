import { Rect, Shadow, Textbox, type FabricObject } from 'fabric';
import type { SceneObject } from '../lib/project';
import { ensureId, linearGradient, makeLine, makePlaceholder } from './factories';

export interface TemplateDef {
  id: string;
  label: string;
  description: string;
  width: number;
  height: number;
  background: string;
  swatch: string[];
  build: () => FabricObject[];
}

function text(str: string, opts: Partial<Textbox> & { name?: string }): Textbox {
  const t = new Textbox(str, {
    originX: 'left',
    originY: 'top',
    paintFirst: 'stroke',
    strokeLineJoin: 'round',
    ...opts,
  });
  if (opts.name) (t as any).name = opts.name;
  ensureId(t);
  return t;
}

function rect(opts: Partial<Rect> & { name?: string }): Rect {
  const r = new Rect({ strokeWidth: 0, strokeUniform: true, ...opts });
  if (opts.name) (r as any).name = opts.name;
  ensureId(r);
  return r;
}

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'bold-thumb',
    label: 'Bold thumbnail',
    description: 'Huge outlined headline, photo on the right',
    width: 1280,
    height: 720,
    background: '#101114',
    swatch: ['#101114', '#ffd400', '#ff3b30'],
    build: () => [
      makePlaceholder(600, 0, 680, 720, 'Drop your photo here'),
      rect({ left: 0, top: 0, width: 640, height: 720, fill: linearGradient(720, [[0, '#101114'], [1, '#1c1d22']]) as any, name: 'Left panel' }),
      text('I TRIED IT FOR 30 DAYS', {
        left: 48,
        top: 64,
        width: 620,
        fontFamily: 'Anton',
        fontSize: 150,
        lineHeight: 0.95,
        fill: '#ffd400',
        stroke: '#000000',
        strokeWidth: 14,
        textAlign: 'left',
        shadow: new Shadow({ color: 'rgba(0,0,0,0.6)', blur: 18, offsetX: 0, offsetY: 8 }),
        name: 'Headline',
      }),
      rect({ left: 48, top: 560, width: 300, height: 76, rx: 10, ry: 10, fill: '#ff3b30', name: 'Tag background' }),
      text('NEW VIDEO', {
        left: 48,
        top: 576,
        width: 300,
        fontFamily: 'Inter',
        fontWeight: 900,
        fontSize: 40,
        fill: '#ffffff',
        textAlign: 'center',
        charSpacing: 60,
        name: 'Tag',
      }),
    ],
  },
  {
    id: 'minimal-cover',
    label: 'Minimal single cover',
    description: 'Square artwork with quiet serif type',
    width: 3000,
    height: 3000,
    background: '#efe9df',
    swatch: ['#efe9df', '#1b1b1b', '#9a8f7e'],
    build: () => [
      makePlaceholder(420, 360, 2160, 2040, 'Drop your cover photo'),
      text('Single Title', {
        left: 300,
        top: 2500,
        width: 2400,
        fontFamily: 'Playfair Display',
        fontWeight: 400,
        fontStyle: 'italic',
        fontSize: 230,
        fill: '#1b1b1b',
        textAlign: 'center',
        name: 'Title',
      }),
      text('ARTIST NAME', {
        left: 300,
        top: 2800,
        width: 2400,
        fontFamily: 'Inter',
        fontWeight: 600,
        fontSize: 84,
        charSpacing: 500,
        fill: '#5b544a',
        textAlign: 'center',
        name: 'Artist',
      }),
    ],
  },
  {
    id: 'release-story',
    label: 'Release announcement',
    description: 'Vertical story / TikTok cover for a drop',
    width: 1080,
    height: 1920,
    background: '#0d0d10',
    swatch: ['#0d0d10', '#ff6b35', '#ffffff'],
    build: () => [
      makePlaceholder(0, 0, 1080, 1240, 'Drop your artwork or photo'),
      rect({
        left: 0,
        top: 900,
        width: 1080,
        height: 360,
        fill: linearGradient(360, [[0, 'rgba(13,13,16,0)'], [1, 'rgba(13,13,16,1)']]) as any,
        name: 'Fade',
      }),
      text('OUT FRIDAY', {
        left: 60,
        top: 1170,
        width: 960,
        fontFamily: 'Bebas Neue',
        fontSize: 230,
        lineHeight: 0.9,
        fill: '#ff6b35',
        textAlign: 'left',
        name: 'Announcement',
      }),
      text('NEW SINGLE TITLE', {
        left: 60,
        top: 1400,
        width: 960,
        fontFamily: 'Inter',
        fontWeight: 900,
        fontSize: 92,
        fill: '#ffffff',
        textAlign: 'left',
        name: 'Title',
      }),
      text('ARTIST NAME', {
        left: 60,
        top: 1520,
        width: 960,
        fontFamily: 'Inter',
        fontWeight: 500,
        fontSize: 46,
        charSpacing: 300,
        fill: '#b8bcc6',
        textAlign: 'left',
        name: 'Artist',
      }),
      Object.assign(makeLine(1080, 1920, { stroke: '#3a3b42', strokeWidth: 3 }, [60, 1640, 1020, 1640]), { name: 'Divider' }),
      text('Pre-save now · Streaming everywhere', {
        left: 60,
        top: 1690,
        width: 960,
        fontFamily: 'Inter',
        fontWeight: 600,
        fontSize: 40,
        fill: '#ffffff',
        textAlign: 'left',
        name: 'Call to action',
      }),
    ],
  },
];

export function templateObjects(t: TemplateDef): SceneObject[] {
  return t.build().map((o) => o.toObject() as SceneObject);
}
