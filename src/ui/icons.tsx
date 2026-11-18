import type { SVGProps } from 'react';

const P: Record<string, string> = {
  upload: 'M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  text: 'M5 6V4h14v2M12 4v16m-3 0h6',
  shapes: 'M4 10h7v10H4zM17.5 3.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM13 20l4-7 4 7z',
  frame: 'M3 7V4h3M18 4h3v3M21 17v3h-3M6 20H3v-3M8 15l2.5-3 2 2.5L15 11l3 4H8z',
  layers: 'm12 3 9 5-9 5-9-5 9-5zm-9 9 9 5 9-5M3 16l9 5 9-5',
  undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  redo: 'm15 14 5-5-5-5m5 5H9a5 5 0 0 0 0 10h3',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.8 0 3.3-.5 4.6-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  unlock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 7.5-2',
  trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  up: 'm6 15 6-6 6 6',
  down: 'm6 9 6 6 6-6',
  toFront: 'M8 8h12v12H8zM4 4h10v2M4 4v10h2',
  toBack: 'M4 4h12v12H4zM18 8h2v12H8v-2',
  crop: 'M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14',
  check: 'm5 12 5 5L20 7',
  x: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  fit: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  magnet: 'M6 3v8a6 6 0 0 0 12 0V3h-4v8a2 2 0 0 1-4 0V3zM6 7h4m4 0h4',
  download: 'M12 4v12m0 0-4-4m4 4 4-4M4 20h16',
  back: 'M15 18l-6-6 6-6',
  image: 'M4 5h16v14H4zM8 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm12 5-5-5L5 19',
  rect: 'M4 6h16v12H4z',
  ellipse: 'M12 5c4.4 0 8 3.1 8 7s-3.6 7-8 7-8-3.1-8-7 3.6-7 8-7z',
  line: 'M5 19 19 5',
  group: 'M4 4h7v7H4zM13 13h7v7h-7z',
  alignLeft: 'M4 3v18M8 7h10v4H8zM8 13h6v4H8z',
  alignHCenter: 'M12 3v18M6 7h12v4H6zM8 13h8v4H8z',
  alignRight: 'M20 3v18M6 7h10v4H6zM10 13h6v4h-6z',
  alignTop: 'M3 4h18M7 8h4v10H7zM13 8h4v6h-4z',
  alignVCenter: 'M3 12h18M7 6h4v12H7zM13 8h4v8h-4z',
  alignBottom: 'M3 20h18M7 6h4v10H7zM13 10h4v6h-4z',
  textLeft: 'M4 6h16M4 10h10M4 14h16M4 18h10',
  textCenter: 'M4 6h16M7 10h10M4 14h16M7 18h10',
  textRight: 'M4 6h16M10 10h10M4 14h16M10 18h10',
  textJustify: 'M4 6h16M4 10h16M4 14h16M4 18h16',
  reset: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4',
  backup: 'M4 7h16v13H4zM9 3h6v4H9zM12 11v6m-3-3 3 3 3-3',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 16, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={P[name]} />
    </svg>
  );
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#24262b" />
      <circle cx="11" cy="11" r="4" fill="#ff6b35" />
      <circle cx="21" cy="11" r="3" fill="#ff6b35" opacity=".7" />
      <circle cx="11" cy="21" r="3" fill="#ff6b35" opacity=".7" />
      <circle cx="21" cy="21" r="2" fill="#ff6b35" opacity=".45" />
    </svg>
  );
}
