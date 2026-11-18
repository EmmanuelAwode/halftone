// Fonts are bundled with the app so editing and export work fully offline.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/inter/900.css';
import '@fontsource/anton/400.css';
import '@fontsource/bebas-neue/400.css';
import '@fontsource/archivo-black/400.css';
import '@fontsource/oswald/400.css';
import '@fontsource/oswald/700.css';
import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/700.css';
import '@fontsource/montserrat/900.css';
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/playfair-display/900.css';
import '@fontsource/dm-serif-display/400.css';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/permanent-marker/400.css';

export interface FontDef {
  family: string;
  weights: number[];
  category: 'display' | 'sans' | 'serif' | 'hand';
}

export const FONTS: FontDef[] = [
  { family: 'Anton', weights: [400], category: 'display' },
  { family: 'Bebas Neue', weights: [400], category: 'display' },
  { family: 'Archivo Black', weights: [400], category: 'display' },
  { family: 'Oswald', weights: [400, 700], category: 'display' },
  { family: 'Inter', weights: [400, 500, 600, 700, 800, 900], category: 'sans' },
  { family: 'Montserrat', weights: [400, 700, 900], category: 'sans' },
  { family: 'Space Grotesk', weights: [400, 700], category: 'sans' },
  { family: 'Playfair Display', weights: [400, 700, 900], category: 'serif' },
  { family: 'DM Serif Display', weights: [400], category: 'serif' },
  { family: 'Permanent Marker', weights: [400], category: 'hand' },
];

export const WEIGHT_LABELS: Record<number, string> = {
  400: 'Regular',
  500: 'Medium',
  600: 'Semibold',
  700: 'Bold',
  800: 'Extra bold',
  900: 'Black',
};

export function fontDef(family: string): FontDef | undefined {
  return FONTS.find((f) => f.family === family);
}

let ready: Promise<void> | null = null;

/** Make sure every bundled face is decoded before Fabric measures text. */
export function loadAllFonts(): Promise<void> {
  if (!ready) {
    ready = Promise.all(
      FONTS.flatMap((f) =>
        f.weights.map((w) => document.fonts.load(`${w} 40px "${f.family}"`).catch(() => [])),
      ),
    ).then(() => undefined);
  }
  return ready;
}
