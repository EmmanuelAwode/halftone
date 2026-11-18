import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './icons';

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="insp-section">
      <header>
        <h3>{title}</h3>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function Row({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="row">
      <label htmlFor={htmlFor}>{label}</label>
      <div className="row-ctl">{children}</div>
    </div>
  );
}

/** Range slider. `onChange` fires live; `onCommit` once when the gesture ends. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  format = (v) => String(Math.round(v * 100)),
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  onCommit: () => void;
}) {
  const dirty = useRef(false);
  const end = () => {
    if (dirty.current) {
      dirty.current = false;
      onCommit();
    }
  };
  const id = `sl-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="slider">
      <div className="slider-head">
        <label htmlFor={id}>{label}</label>
        <output>{format(value)}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        style={{ ['--pct' as string]: `${((value - min) / (max - min)) * 100}%` }}
        onChange={(e) => {
          dirty.current = true;
          onChange(Number(e.target.value));
        }}
        onPointerUp={end}
        onKeyUp={end}
        onBlur={end}
      />
    </div>
  );
}

/** Numeric field: commits on Enter/blur, arrow keys step (shift ×10). */
export function NumberField({
  value,
  onCommit,
  label,
  min,
  max,
  step = 1,
  suffix,
  decimals = 0,
  title,
}: {
  value: number;
  onCommit: (v: number) => void;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  decimals?: number;
  title?: string;
}) {
  const fmt = (v: number) => (Number.isFinite(v) ? String(Number(v.toFixed(decimals))) : '');
  const [text, setText] = useState(fmt(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals]);
  const clamp = (v: number) => Math.max(min ?? -Infinity, Math.min(max ?? Infinity, v));
  const commit = (raw: string) => {
    const v = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(v)) {
      setText(fmt(value));
      return;
    }
    const c = clamp(v);
    setText(fmt(c));
    if (c !== value) onCommit(c);
  };
  return (
    <div className="numfield" title={title}>
      {label && <span className="numfield-label">{label}</span>}
      <input
        inputMode="decimal"
        value={text}
        aria-label={title ?? label}
        onFocus={(e) => {
          focused.current = true;
          e.target.select();
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => {
          focused.current = false;
          commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'Escape') {
            setText(fmt(value));
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            const next = clamp((Number(text) || 0) + d);
            setText(fmt(next));
            onCommit(next);
          }
        }}
      />
      {suffix && <span className="numfield-suffix">{suffix}</span>}
    </div>
  );
}

export function toHex(color: string | null | undefined): string {
  if (!color) return '#000000';
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) return ('#' + color.slice(1).split('').map((c) => c + c).join('')).toLowerCase();
  const ctx = document.createElement('canvas').getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillStyle = color;
  const v = ctx.fillStyle as string;
  if (v.startsWith('#')) return v;
  const m = v.match(/\d+(\.\d+)?/g);
  if (!m) return '#000000';
  return '#' + m.slice(0, 3).map((n) => Math.round(Number(n)).toString(16).padStart(2, '0')).join('');
}

/** Colour swatch + hex field. Live updates while picking, debounced undo step. */
export function ColorField({
  value,
  onChange,
  label,
  allowNone,
  onNone,
}: {
  value: string | null;
  onChange: (v: string, phase: 'live' | 'done') => void;
  label: string;
  allowNone?: boolean;
  onNone?: () => void;
}) {
  const hex = value ? toHex(value) : '';
  const [text, setText] = useState(hex);
  useEffect(() => setText(hex), [hex]);
  return (
    <div className="colorfield">
      <label className={`swatch ${value ? '' : 'none'}`} style={{ background: value ?? undefined }} title={`${label} colour`}>
        <input
          type="color"
          value={hex || '#ffffff'}
          aria-label={`${label} colour`}
          onChange={(e) => onChange(e.target.value, 'live')}
          onBlur={(e) => onChange(e.target.value, 'done')}
        />
      </label>
      <input
        className="hex"
        value={text}
        placeholder={allowNone ? 'None' : '#000000'}
        aria-label={`${label} hex`}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        onBlur={() => {
          const t = text.trim();
          if (!t && allowNone) return onNone?.();
          const v = /^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(t) ? '#' + t : t;
          if (CSS.supports('color', v)) onChange(v, 'done');
          else setText(hex);
        }}
      />
      {allowNone && value && (
        <button className="icon-btn sm" title={`Remove ${label.toLowerCase()}`} onClick={onNone}>
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T | undefined;
  options: { value: T; label?: string; icon?: IconName; title: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'on' : ''}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.icon ? <Icon name={o.icon} size={15} /> : o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}

export function IconButton({
  icon,
  title,
  onClick,
  disabled,
  active,
  size = 16,
  className = '',
}: {
  icon: IconName;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <button
      className={`icon-btn ${active ? 'active' : ''} ${className}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}
