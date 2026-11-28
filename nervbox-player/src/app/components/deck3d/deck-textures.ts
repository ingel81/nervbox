import { rand } from './deck-util';

/** Prozedurale Texturen (2D-Canvas) – keine externen Assets. */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** Dunkles Nussbaum-Furnier mit Gebrauchsspuren. */
export function makeWoodCanvas(): HTMLCanvasElement {
  const size = 1024;
  const [c, ctx] = canvas(size, size);
  const rnd = rand(7);
  ctx.fillStyle = '#3b2716';
  ctx.fillRect(0, 0, size, size);
  // Bretter mit leicht unterschiedlichem Ton
  const boards = 4;
  for (let b = 0; b < boards; b++) {
    const tone = 0.82 + rnd() * 0.3;
    ctx.fillStyle = `rgb(${Math.round(70 * tone)},${Math.round(46 * tone)},${Math.round(27 * tone)})`;
    ctx.fillRect(0, (b * size) / boards, size, size / boards);
  }
  // Maserung
  for (let i = 0; i < 560; i++) {
    const y0 = rnd() * size;
    const amp = 3 + rnd() * 14;
    const freq = 0.002 + rnd() * 0.006;
    const ph = rnd() * 10;
    const dark = rnd() < 0.7;
    ctx.strokeStyle = dark
      ? `rgba(18,10,4,${(0.08 + rnd() * 0.22).toFixed(3)})`
      : `rgba(140,96,58,${(0.04 + rnd() * 0.08).toFixed(3)})`;
    ctx.lineWidth = 0.6 + rnd() * 2.2;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 16) {
      const y = y0 + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 3.1 + ph) * amp * 0.25;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Astlöcher
  for (let i = 0; i < 3; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 10 + rnd() * 16;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
    g.addColorStop(0, 'rgba(14,8,3,0.75)');
    g.addColorStop(0.35, 'rgba(26,15,7,0.4)');
    g.addColorStop(1, 'rgba(26,15,7,0)');
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(2.2, 1);
    ctx.translate(-x, -y);
    ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
    ctx.restore();
  }
  // Fugen
  ctx.fillStyle = 'rgba(8,5,2,0.7)';
  for (let b = 1; b < boards; b++) ctx.fillRect(0, (b * size) / boards - 1, size, 2);
  // Gebrauchsspuren: feine Kratzer
  for (let i = 0; i < 90; i++) {
    ctx.strokeStyle = `rgba(170,130,90,${(0.03 + rnd() * 0.05).toFixed(3)})`;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    const x = rnd() * size;
    const y = rnd() * size;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * 120, y + (rnd() - 0.5) * 30);
    ctx.stroke();
  }
  return c;
}

/** Rauheits-Karte des Tischs: Lack mit Wischspuren und einem Tassenrand. */
export function makeTableRoughCanvas(): HTMLCanvasElement {
  const size = 512;
  const [c, ctx] = canvas(size, size);
  const img = ctx.createImageData(size, size);
  const rnd = rand(29);
  for (let i = 0; i < size * size; i++) {
    const v = 168 + 60 * rnd();
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // Wischspuren (glatter = dunkler)
  for (let i = 0; i < 26; i++) {
    ctx.strokeStyle = `rgba(120,120,120,${(0.05 + rnd() * 0.08).toFixed(3)})`;
    ctx.lineWidth = 8 + rnd() * 30;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const x = rnd() * size;
    const y = rnd() * size;
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + (rnd() - 0.5) * 300,
      y + (rnd() - 0.5) * 120,
      x + (rnd() - 0.5) * 420,
      y + (rnd() - 0.5) * 160,
    );
    ctx.stroke();
  }
  return c;
}

export function makeNoiseCanvas(
  size: number,
  lo: number,
  hi: number,
  seed = 13,
): HTMLCanvasElement {
  const [c, ctx] = canvas(size, size);
  const img = ctx.createImageData(size, size);
  const rnd = rand(seed);
  for (let i = 0; i < size * size; i++) {
    const v = lo + (hi - lo) * rnd();
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Wolkiger Staub-Sprite. */
export function makeDustSprite(): HTMLCanvasElement {
  const size = 128;
  const [c, ctx] = canvas(size, size);
  const rnd = rand(3);
  for (let i = 0; i < 7; i++) {
    const x = size / 2 + (rnd() - 0.5) * size * 0.3;
    const y = size / 2 + (rnd() - 0.5) * size * 0.3;
    const r = size * (0.22 + rnd() * 0.2);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(176,160,138,0.45)');
    g.addColorStop(0.6, 'rgba(150,136,116,0.16)');
    g.addColorStop(1, 'rgba(140,126,106,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return c;
}

export interface PrintLine {
  text: string;
  /** 0…1 relativ zur Canvas-Breite/-Höhe */
  x: number;
  y: number;
  /** Schrifthöhe relativ zur Canvas-Höhe */
  size: number;
  font?: 'ui' | 'logo' | 'mono';
  weight?: number;
  align?: CanvasTextAlign;
  spacing?: number;
  alpha?: number;
}

const FONTS = {
  ui: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
  logo: "'Michroma', 'Arial Black', Arial, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, Consolas, monospace",
};

/** Siebdruck-Beschriftung: heller Aufdruck auf transparentem Grund. */
export function makePrintCanvas(
  w: number,
  h: number,
  lines: PrintLine[],
  color = '236,224,196',
  decorate?: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): HTMLCanvasElement {
  const [c, ctx] = canvas(w, h);
  ctx.textBaseline = 'middle';
  for (const l of lines) {
    const px = Math.round(l.size * h);
    ctx.font = `${l.weight ?? 600} ${px}px ${FONTS[l.font ?? 'ui']}`;
    ctx.textAlign = l.align ?? 'left';
    ctx.fillStyle = `rgba(${color},${l.alpha ?? 1})`;
    const sp = l.spacing ?? 0;
    try {
      (ctx as unknown as { letterSpacing: string }).letterSpacing = `${(sp * px).toFixed(1)}px`;
    } catch {
      /* ältere Browser: ohne Sperrung */
    }
    ctx.fillText(l.text, l.x * w, l.y * h);
  }
  decorate?.(ctx, w, h);
  return c;
}

/** Papieretikett des Steckmoduls. */
export function makeCartLabelCanvas(): HTMLCanvasElement {
  const [c, ctx] = canvas(512, 96);
  ctx.fillStyle = '#e6d8b2';
  ctx.fillRect(0, 0, 512, 96);
  const stripes = ['#e0483c', '#e39a3a', '#ebc544', '#3ba8a1', '#6f93b5'];
  stripes.forEach((s, i) => {
    ctx.fillStyle = s;
    ctx.fillRect(18 + i * 26, 16, 22, 10);
  });
  ctx.fillStyle = '#1f1b16';
  ctx.textBaseline = 'middle';
  ctx.font = `700 40px ${FONTS.ui}`;
  ctx.fillText('SPIELHALLE', 18, 62);
  ctx.font = `500 20px ${FONTS.mono}`;
  ctx.textAlign = 'right';
  ctx.fillText('MODUL 01 · CABD', 494, 26);
  ctx.fillText('30 JAHRE', 494, 66);
  // vergilbter Rand
  const g = ctx.createLinearGradient(0, 0, 0, 96);
  g.addColorStop(0, 'rgba(120,90,40,0.18)');
  g.addColorStop(0.2, 'rgba(120,90,40,0)');
  g.addColorStop(0.85, 'rgba(120,90,40,0)');
  g.addColorStop(1, 'rgba(90,60,20,0.25)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 96);
  return c;
}
