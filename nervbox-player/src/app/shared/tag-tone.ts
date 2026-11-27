/**
 * Tag-Farbe aus der DB (#RRGGBB) → Tastenfarbe des Nacht-Kits.
 * Liefert die --nk-key-*-Variablen als Inline-Style, damit .nk-pad / .nk-tag
 * in der Tag-Farbe durchleuchten (helles Gummi = dunkler Aufdruck und umgekehrt).
 */
const FALLBACK = '#AA9D7C';
const cache = new Map<string, string>();

function parse(hex: string): [number, number, number] {
  let h = (hex || FALLBACK).trim().replace('#', '');
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) h = FALLBACK.slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function mix([r, g, b]: number[], [r2, g2, b2]: number[], t: number): number[] {
  return [r + (r2 - r) * t, g + (g2 - g) * t, b + (b2 - b) * t].map((v) => Math.round(v));
}

const hex = (c: number[]) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');

function luminance([r, g, b]: number[]): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/**
 * Gummi-Palette des Nacht-Kits. DB-Farben werden auf den nächstliegenden Farbton
 * abgebildet: Tags bleiben unterscheidbar, das Gerät sieht trotzdem aus wie aus einem Guss
 * (kein Neon-Lila/-Grün aus Standardfarben).
 */
const RUBBER: { hue: number; hex: string }[] = [
  { hue: 8, hex: '#93271F' }, // cabd-rot
  { hue: 32, hex: '#C4802F' }, // classic-orange
  { hue: 45, hex: '#BC972C' }, // fx-gelb
  { hue: 75, hex: '#909E59' }, // trash-oliv
  { hue: 125, hex: '#4F8A55' }, // gummigrün
  { hue: 176, hex: '#22635F' }, // remix-petrol
  { hue: 210, hex: '#43586E' }, // assitoni-stahlblau
  { hue: 228, hex: '#3F6E9E' }, // signalblau
  { hue: 268, hex: '#6E5A8A' }, // pflaume
  { hue: 330, hex: '#BE8789' }, // themes-rosé
];
const NEUTRAL_LIGHT = '#AA9D7C'; // voice-putty
const NEUTRAL_DARK = '#443E37'; // alarm-dunkel

function toRubber(rgb: [number, number, number]): [number, number, number] {
  const [r, g, b] = rgb.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (sat < 0.25) return parse(l > 0.45 ? NEUTRAL_LIGHT : NEUTRAL_DARK);
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  let best = RUBBER[0];
  let bestDist = 999;
  for (const c of RUBBER) {
    const dist = Math.min(Math.abs(c.hue - h), 360 - Math.abs(c.hue - h));
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return parse(best.hex);
}

/** Style-String mit den Tasten-Variablen für eine Tag-Farbe. */
export function tagToneStyle(color: string | undefined | null): string {
  const key = color || FALLBACK;
  const hit = cache.get(key);
  if (hit) return hit;

  const base = color ? toRubber(parse(key)) : parse(FALLBACK);
  const mid = base;
  const hot = mix(mid, [255, 240, 210], 0.18);
  const edge = mix(mid, [0, 0, 0], 0.22);
  const lens = mix(base, [255, 250, 235], 0.32);
  const glow = mix(base, [255, 255, 255], 0.12);
  const light = luminance(mid) > 0.22;

  const style = [
    `--nk-key-hot: ${hex(hot)}`,
    `--nk-key-mid: ${hex(mid)}`,
    `--nk-key-edge: ${hex(edge)}`,
    `--nk-key-glow: ${glow.join(' ')}`,
    `--nk-key-lens: ${hex(lens)}`,
    light
      ? '--nk-key-ink: var(--nk-ink); --nk-key-line: rgb(20 17 13 / .65); --nk-key-emboss: 0 1px 0 rgb(255 255 255 / .22); --nk-key-hl-a: .14; --nk-key-hl-b: .42; --nk-key-sheen: .2'
      : '--nk-key-ink: var(--nk-key-ink-light); --nk-key-line: rgb(255 248 232 / .7); --nk-key-emboss: 0 1px 1px rgb(0 0 0 / .45); --nk-key-hl-a: .08; --nk-key-hl-b: .3; --nk-key-sheen: .1',
  ].join('; ');
  cache.set(key, style);
  return style;
}
