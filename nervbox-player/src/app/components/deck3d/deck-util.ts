/** Kleine Rechenhelfer für Intro und 3D-Ansicht. */

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** 0…1 über das Intervall [a, b] */
export const seg = (t: number, a: number, b: number): number => clamp01((t - a) / (b - a));
export const easeOutCubic = (x: number): number => 1 - Math.pow(1 - x, 3);
export const easeOutQuart = (x: number): number => 1 - Math.pow(1 - x, 4);
export const easeInOutCubic = (x: number): number =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
export const easeInOutSine = (x: number): number => -(Math.cos(Math.PI * x) - 1) / 2;
export const smoothstep = (x: number): number => x * x * (3 - 2 * x);

/** Deterministischer Zufall (gleiches Bild bei jedem Laden) */
export function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** „#rrggbb“, „#rgb“ oder „rgb(a)(…)“ → [r, g, b] (0–255); null bei transparent/unlesbar */
export function parseColor(input: string): [number, number, number] | null {
  const s = input.trim();
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
      ];
    }
    if (hex.length >= 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
    return null;
  }
  const m = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?/);
  if (!m) return null;
  if (m[4] !== undefined) {
    const a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    if (a < 0.3) return null;
  }
  return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
}
