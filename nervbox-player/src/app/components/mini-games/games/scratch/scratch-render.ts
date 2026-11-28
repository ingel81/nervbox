/**
 * Zeichnet den Losbogen (Druck unter der Folie) und die Rubbelfolie.
 * Alle Masse in logischen Koordinaten W x H (siehe scratch.types.ts).
 */
import {
  ADMIN,
  BONUS,
  GRID,
  H,
  Rect,
  SYMBOL_ART,
  ScratchBuyResponse,
  ScratchTicketInfo,
  TicketTheme,
  W,
  WILD,
  cellRect,
} from './scratch.types';

const FONT_UI = '"Barlow Condensed", "Arial Narrow", sans-serif';
const FONT_MONO = '"IBM Plex Mono", ui-monospace, monospace';
const FONT_LOGO = 'Michroma, sans-serif';
const FONT_EMOJI = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

type Ctx = CanvasRenderingContext2D;

/** Deterministischer Zufall, damit Papier-/Holzstruktur bei jedem Neuzeichnen gleich bleibt */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function rr(ctx: Ctx, r: Rect, rad: number): void {
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, rad);
}

export interface TicketDrawState {
  info: ScratchTicketInfo | null;
  ticket: ScratchBuyResponse | null;
  /** Gewinnfelder hervorheben (nach dem Freirubbeln) */
  highlight: boolean;
  /** Puls 0..1 fuer leuchtende Gewinnfelder */
  pulse: number;
}

// ------------------------------------------------------------------ Losbogen

export function drawTicket(ctx: Ctx, theme: TicketTheme, st: TicketDrawState): void {
  ctx.clearRect(0, 0, W, H);
  drawPaper(ctx, theme);
  drawHeader(ctx, theme, st.info);
  drawGridBed(ctx, theme);
  for (let i = 0; i < 9; i++) {
    const id = st.ticket?.grid[i] ?? null;
    const win = !!st.ticket && st.highlight && st.ticket.winCells.includes(i);
    drawCell(
      ctx,
      theme,
      cellRect(i),
      id,
      win ? (st.ticket!.confiscated ? 'bad' : 'win') : null,
      st.pulse,
    );
  }
  if (theme.key === 'mett') drawBonusField(ctx, theme, st.ticket?.bonus ?? null);
  drawPrizeTable(ctx, theme, st.info);
  drawFooter(ctx, theme, st.ticket?.serial ?? null);
}

function ticketPath(ctx: Ctx): void {
  // Los mit Stanzkerben links/rechts auf Hoehe der Trennlinie
  const x = 8,
    y = 8,
    w = W - 16,
    h = H - 16,
    r = 16,
    notchY = 204,
    nr = 12;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, notchY - nr);
  ctx.arc(x + w, notchY, nr, -Math.PI / 2, Math.PI / 2, true);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, notchY + nr);
  ctx.arc(x, notchY, nr, Math.PI / 2, -Math.PI / 2, true);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawPaper(ctx: Ctx, t: TicketTheme): void {
  ctx.save();
  ticketPath(ctx);
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, t.paper);
  g.addColorStop(1, t.paper2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();

  const rand = rng(t.key.length * 7919);
  // Guilloche-Wellen (Banknotenmuster) im Kopf
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = t.accent;
  ctx.lineWidth = 0.8;
  for (let k = 0; k < 14; k++) {
    ctx.beginPath();
    for (let x = 0; x <= W; x += 6) {
      const y = 30 + k * 11 + Math.sin(x / 38 + k * 0.7) * 9 + Math.sin(x / 13 + k) * 2;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Motivstruktur unten
  if (t.cell === 'slice') {
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = t.ink;
    for (let k = 0; k < 40; k++) {
      ctx.beginPath();
      const y0 = 636 + k * 7;
      for (let x = 0; x <= W; x += 10) {
        const y = y0 + Math.sin(x / 70 + k * 0.4) * 4 + (rand() - 0.5) * 1.2;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (t.cell === 'vault') {
    ctx.globalAlpha = 0.045;
    ctx.fillStyle = t.ink;
    ctx.font = `700 13px ${FONT_LOGO}`;
    for (let y = 650; y < H; y += 22) {
      for (let x = (y / 22) % 2 ? -20 : 10; x < W; x += 92) ctx.fillText('N$', x, y);
    }
  } else {
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = t.accent;
    for (let k = 0; k < 160; k++) {
      ctx.beginPath();
      ctx.arc(rand() * W, 636 + rand() * 260, 1 + rand() * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Papierfasern
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = '#000';
  for (let k = 0; k < 900; k++) ctx.fillRect(rand() * W, rand() * H, 1, 1 + rand() * 2);
  ctx.globalAlpha = 1;
  ctx.restore();

  // Rand
  ctx.save();
  ticketPath(ctx);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.stroke();
  ctx.restore();

  // Perforation zwischen Kopf und Spielfeld
  ctx.save();
  ctx.strokeStyle = t.ink;
  ctx.globalAlpha = 0.35;
  ctx.setLineDash([5, 6]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(26, 204);
  ctx.lineTo(W - 26, 204);
  ctx.stroke();
  ctx.restore();
}

function drawSeal(ctx: Ctx, t: TicketTheme, cx: number, cy: number, r: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  // Rosette
  ctx.strokeStyle = t.accent;
  ctx.lineWidth = 0.9;
  for (let k = 0; k < 36; k++) {
    ctx.rotate(Math.PI / 18);
    ctx.beginPath();
    ctx.ellipse(r * 0.42, 0, r * 0.52, r * 0.16, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.56, 0, Math.PI * 2);
  ctx.fillStyle = t.accent;
  ctx.fill();
  ctx.fillStyle = t.accentInk;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(r * 0.38)}px ${FONT_LOGO}`;
  ctx.fillText('NB', 0, -r * 0.06);
  ctx.font = `700 ${Math.round(r * 0.2)}px ${FONT_MONO}`;
  ctx.fillText('1996', 0, r * 0.3);
  ctx.restore();
}

function drawHeader(ctx: Ctx, t: TicketTheme, info: ScratchTicketInfo | null): void {
  ctx.save();
  ctx.fillStyle = t.ink;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 13px ${FONT_MONO}`;
  ctx.textAlign = 'left';
  ctx.fillText('NERVBOX-ZENTRALBANK', 30, 38);
  ctx.textAlign = 'right';
  ctx.fillText('SOFORTLOS · SERIE 2026', W - 30, 38);

  drawSeal(ctx, t, 78, 106, 44);

  ctx.textAlign = 'left';
  ctx.font = `800 50px ${FONT_UI}`;
  ctx.fillStyle = t.accent;
  ctx.fillText((info?.name ?? '…').toUpperCase(), 138, 110, 300);
  ctx.font = `italic 500 19px ${FONT_UI}`;
  ctx.fillStyle = t.ink;
  ctx.fillText(t.tagline, 140, 140, 300);

  // Preis-Plakette
  const px = W - 76,
    py = 104;
  ctx.beginPath();
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const rad = k % 2 ? 44 : 50;
    ctx.lineTo(px + Math.cos(a) * rad, py + Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fillStyle = t.accent;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.stroke();
  ctx.fillStyle = t.accentInk;
  ctx.textAlign = 'center';
  ctx.font = `600 11px ${FONT_MONO}`;
  ctx.fillText('PREIS', px, py - 18);
  ctx.font = `800 38px ${FONT_UI}`;
  ctx.fillText(String(info?.price ?? '?'), px, py + 14);
  ctx.font = `700 13px ${FONT_UI}`;
  ctx.fillText('N$', px, py + 30);

  // Band
  const top = info ? Math.max(...info.symbols.map((s) => s.prize)) * (info.bonus ? 5 : 1) : 0;
  ctx.fillStyle = t.accent;
  rr(ctx, { x: 30, y: 160, w: W - 60, h: 30 }, 4);
  ctx.fill();
  ctx.fillStyle = t.accentInk;
  ctx.font = `700 17px ${FONT_UI}`;
  ctx.fillText(
    `FINDE 3 GLEICHE SYMBOLE  ·  GEWINNE BIS ZU ${top.toLocaleString('de-DE')} N$`,
    W / 2,
    181,
    W - 80,
  );
  ctx.restore();
}

function drawGridBed(ctx: Ctx, t: TicketTheme): void {
  ctx.save();
  const pad = 8;
  rr(ctx, { x: GRID.x - pad, y: GRID.y - pad, w: GRID.w + pad * 2, h: GRID.h + pad * 2 }, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = t.ink;
  ctx.globalAlpha = 0.4;
  ctx.stroke();
  ctx.restore();
}

function drawCell(
  ctx: Ctx,
  t: TicketTheme,
  r: Rect,
  id: string | null,
  mark: 'win' | 'bad' | null,
  pulse: number,
): void {
  ctx.save();
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  if (t.cell === 'slice') {
    // Baumscheibe
    const rx = r.w / 2 - 4,
      ry = r.h / 2 - 4;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#5a361a';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx - 6, ry - 6, 0, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, rx);
    g.addColorStop(0, '#f3d6a4');
    g.addColorStop(0.7, '#dcb27a');
    g.addColorStop(1, '#b07c45');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(110,64,26,0.35)';
    ctx.lineWidth = 1.2;
    const rand = rng(Math.round(r.x * 13 + r.y * 7));
    for (let k = 1; k < 7; k++) {
      ctx.beginPath();
      const f = k / 7;
      for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.2) {
        const w = 1 + (rand() - 0.5) * 0.05;
        const x = cx + Math.cos(a) * (rx - 6) * f * w;
        const y = cy + Math.sin(a) * (ry - 6) * f * w;
        if (a === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
  } else if (t.cell === 'vault') {
    // Schliessfach
    rr(ctx, r, 6);
    const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    g.addColorStop(0, '#9aa39e');
    g.addColorStop(0.5, '#6d7772');
    g.addColorStop(1, '#4e5753');
    ctx.fillStyle = g;
    ctx.fill();
    rr(ctx, { x: r.x + 9, y: r.y + 9, w: r.w - 18, h: r.h - 18 }, 4);
    ctx.fillStyle = '#e3e8e2';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#c8d0ca';
    for (const [dx, dy] of [
      [5, 5],
      [r.w - 5, 5],
      [5, r.h - 5],
      [r.w - 5, r.h - 5],
    ]) {
      ctx.beginPath();
      ctx.arc(r.x + dx, r.y + dy, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Mettbroetchen-Haelfte
    ctx.beginPath();
    ctx.ellipse(cx, cy, r.w / 2 - 4, r.h / 2 - 4, 0, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(cx, cy - 10, 10, cx, cy, r.w / 2);
    g.addColorStop(0, '#f0c27e');
    g.addColorStop(1, '#a8682c');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, cy, r.w / 2 - 13, r.h / 2 - 12, 0, 0, Math.PI * 2);
    const m = ctx.createRadialGradient(cx, cy, 6, cx, cy, r.w / 2);
    m.addColorStop(0, '#f0a296');
    m.addColorStop(1, '#c9675a');
    ctx.fillStyle = m;
    ctx.fill();
    const rand = rng(Math.round(r.x * 5 + r.y * 11));
    ctx.fillStyle = 'rgba(255,240,230,0.55)';
    for (let k = 0; k < 40; k++) {
      const a = rand() * Math.PI * 2,
        d = rand();
      ctx.fillRect(
        cx + Math.cos(a) * d * (r.w / 2 - 16),
        cy + Math.sin(a) * d * (r.h / 2 - 15),
        1.6,
        1.6,
      );
    }
  }

  if (mark) {
    const col = mark === 'win' ? '255, 214, 74' : '224, 60, 48';
    ctx.shadowColor = `rgba(${col}, 1)`;
    ctx.shadowBlur = 12 + pulse * 14;
    ctx.lineWidth = 5;
    ctx.strokeStyle = `rgba(${col}, ${0.75 + pulse * 0.25})`;
    rr(ctx, { x: r.x + 2, y: r.y + 2, w: r.w - 4, h: r.h - 4 }, 10);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  if (id) drawSymbol(ctx, t, id, cx, cy - 10, 60);
  if (id) {
    const art = SYMBOL_ART[id];
    ctx.font = `700 15px ${FONT_UI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = art?.label ?? id.toUpperCase();
    const tw = Math.min(r.w - 20, ctx.measureText(label).width + 14);
    rr(ctx, { x: cx - tw / 2, y: r.y + r.h - 30, w: tw, h: 19 }, 3);
    ctx.fillStyle =
      id === ADMIN ? '#b3261e' : id === WILD ? '#121212' : mark === 'win' ? '#7a5a00' : t.accent;
    ctx.fill();
    ctx.fillStyle = id === WILD ? '#ffd84a' : '#fff6e2';
    ctx.fillText(label, cx, r.y + r.h - 20, r.w - 26);
  }
  ctx.restore();
}

/** Ein Symbol (Emoji oder selbst gezeichnet) mittig bei cx/cy */
export function drawSymbol(
  ctx: Ctx,
  t: TicketTheme,
  id: string,
  cx: number,
  cy: number,
  size: number,
): void {
  const art = SYMBOL_ART[id];
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (art?.draw === 'wild') {
    drawWild(ctx, cx, cy, size);
  } else if (art?.draw === 'admin') {
    drawAdmin(ctx, cx, cy, size);
  } else if (art?.draw === 'bar') {
    drawGoldBar(ctx, cx, cy, size);
  } else {
    if (art?.gold) {
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, size * 0.75);
      g.addColorStop(0, 'rgba(255,230,120,0.95)');
      g.addColorStop(0.6, 'rgba(255,190,40,0.45)');
      g.addColorStop(1, 'rgba(255,190,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.75, 0, Math.PI * 2);
      ctx.fill();
      // Strahlen
      ctx.strokeStyle = 'rgba(255,200,40,0.7)';
      ctx.lineWidth = 2;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * size * 0.45, cy + Math.sin(a) * size * 0.45);
        ctx.lineTo(cx + Math.cos(a) * size * 0.68, cy + Math.sin(a) * size * 0.68);
        ctx.stroke();
      }
      if ('filter' in ctx) ctx.filter = 'sepia(1) saturate(4) hue-rotate(-12deg) brightness(1.1)';
    }
    ctx.font = `${size}px ${FONT_EMOJI}`;
    ctx.fillStyle = '#000';
    ctx.fillText(art?.emoji ?? '?', cx, cy + size * 0.04);
    if (art?.gold) {
      ctx.filter = 'none';
      ctx.font = `${Math.round(size * 0.38)}px ${FONT_EMOJI}`;
      ctx.fillText('👑', cx + size * 0.36, cy - size * 0.4);
    }
  }
  ctx.restore();
}

function drawWild(ctx: Ctx, cx: number, cy: number, size: number): void {
  const r = size * 0.5;
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, 2, cx, cy, r * 1.1);
  g.addColorStop(0, '#3a3a3a');
  g.addColorStop(1, '#050505');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffd84a';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 6, 0, Math.PI * 2);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,216,74,0.6)';
  ctx.stroke();
  ctx.fillStyle = '#ffe9a6';
  ctx.shadowColor = 'rgba(255,216,74,0.9)';
  ctx.shadowBlur = 8;
  ctx.font = `700 ${Math.round(size * 0.3)}px ${FONT_LOGO}`;
  ctx.fillText('NB', cx, cy - 2);
  ctx.shadowBlur = 0;
  ctx.font = `700 ${Math.round(size * 0.13)}px ${FONT_MONO}`;
  ctx.fillText('NERVBOX', cx, cy + r * 0.52);
}

function drawAdmin(ctx: Ctx, cx: number, cy: number, size: number): void {
  ctx.translate(cx, cy);
  ctx.rotate(-0.14);
  ctx.strokeStyle = '#b3261e';
  ctx.fillStyle = '#b3261e';
  ctx.lineWidth = 3.5;
  rr(ctx, { x: -size * 0.72, y: -size * 0.36, w: size * 1.44, h: size * 0.72 }, 6);
  ctx.stroke();
  ctx.lineWidth = 1.2;
  rr(ctx, { x: -size * 0.66, y: -size * 0.3, w: size * 1.32, h: size * 0.6 }, 4);
  ctx.stroke();
  ctx.font = `800 ${Math.round(size * 0.4)}px ${FONT_UI}`;
  ctx.fillText('ADMIN', 0, -size * 0.04);
  ctx.font = `700 ${Math.round(size * 0.12)}px ${FONT_MONO}`;
  ctx.fillText('ZUGRIFF VERWEIGERT', 0, size * 0.2, size * 1.2);
}

function drawGoldBar(ctx: Ctx, cx: number, cy: number, size: number): void {
  const w = size * 1.2,
    h = size * 0.5,
    inset = size * 0.18;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2 + inset, cy - h / 2);
  ctx.lineTo(cx + w / 2 - inset, cy - h / 2);
  ctx.lineTo(cx + w / 2, cy + h / 2);
  ctx.lineTo(cx - w / 2, cy + h / 2);
  ctx.closePath();
  const g = ctx.createLinearGradient(cx, cy - h / 2, cx, cy + h / 2);
  g.addColorStop(0, '#fff2a8');
  g.addColorStop(0.45, '#f1c232');
  g.addColorStop(1, '#a8740c');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#7a5200';
  ctx.stroke();
  ctx.fillStyle = '#7a5200';
  ctx.font = `700 ${Math.round(size * 0.17)}px ${FONT_MONO}`;
  ctx.fillText('999.9', cx, cy + 2);
}

function drawBonusField(ctx: Ctx, t: TicketTheme, bonus: number | null): void {
  ctx.save();
  const { x, y, r } = BONUS;
  ctx.fillStyle = t.ink;
  ctx.textAlign = 'center';
  ctx.font = `800 16px ${FONT_UI}`;
  ctx.fillText('BONUS-IGEL', x, y - r - 12);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#fff3e3';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = t.accent;
  ctx.stroke();
  ctx.setLineDash([]);
  if (bonus !== null) {
    ctx.textBaseline = 'middle';
    if (bonus > 1) {
      ctx.font = `44px ${FONT_EMOJI}`;
      ctx.fillText('🦔', x, y - 14);
      ctx.fillStyle = t.accent;
      ctx.font = `800 34px ${FONT_UI}`;
      ctx.fillText(`×${bonus}`, x, y + 28);
    } else {
      ctx.font = `36px ${FONT_EMOJI}`;
      ctx.fillText('💤', x, y - 12);
      ctx.fillStyle = t.ink;
      ctx.font = `700 15px ${FONT_UI}`;
      ctx.fillText('IGEL SCHLÄFT', x, y + 24);
    }
  }
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = t.ink;
  ctx.font = `600 13px ${FONT_UI}`;
  ctx.fillText('×2 oder ×5 auf den Gewinn', x, y + r + 20);
  ctx.restore();
}

function drawPrizeTable(ctx: Ctx, t: TicketTheme, info: ScratchTicketInfo | null): void {
  if (!info) return;
  ctx.save();
  const mett = t.key === 'mett';
  const x0 = mett ? 186 : 40;
  const x1 = W - 40;
  const colW = (x1 - x0) / 2;
  ctx.fillStyle = t.ink;
  ctx.textAlign = 'left';
  ctx.font = `800 17px ${FONT_UI}`;
  ctx.fillText('GEWINNPLAN', x0, 664);
  ctx.font = `500 15px ${FONT_UI}`;
  ctx.fillText('· 3× das gleiche Symbol gewinnt', x0 + 92, 664);
  ctx.globalAlpha = 0.4;
  ctx.fillRect(x0, 672, x1 - x0, 1.5);
  ctx.globalAlpha = 1;

  const syms = [...info.symbols].sort((a, b) => b.prize - a.prize);
  syms.forEach((s, i) => {
    const col = i < 4 ? 0 : 1;
    const row = i < 4 ? i : i - 4;
    const x = x0 + col * colW + (col ? 10 : 0);
    const y = 696 + row * 26;
    drawSymbol(ctx, t, s.id, x + 11, y - 5, 20);
    ctx.fillStyle = t.ink;
    ctx.textAlign = 'left';
    ctx.font = `600 16px ${FONT_UI}`;
    ctx.fillText(s.name, x + 26, y, colW - 100);
    ctx.textAlign = 'right';
    ctx.font = `800 17px ${FONT_UI}`;
    ctx.fillText(`${s.prize.toLocaleString('de-DE')} N$`, x + colW - (col ? 10 : 14), y);
  });
  // Sonderfelder in der 4. Zeile rechts
  const sx = x0 + colW + 10;
  const sy = 696 + 3 * 26;
  drawSymbol(ctx, t, WILD, sx + 11, sy - 5, 22);
  ctx.textAlign = 'left';
  ctx.fillStyle = t.ink;
  ctx.font = `600 15px ${FONT_UI}`;
  ctx.fillText('Joker ersetzt jedes Symbol', sx + 26, sy, colW - 40);

  ctx.textAlign = 'center';
  const ay = 810;
  rr(ctx, { x: x0, y: ay - 18, w: x1 - x0, h: 26 }, 4);
  ctx.fillStyle = 'rgba(179,38,30,0.12)';
  ctx.fill();
  ctx.fillStyle = '#9a1f18';
  ctx.font = `700 15px ${FONT_UI}`;
  ctx.fillText(
    'ADMIN auf dem Los = Los beschlagnahmt, alles weg. Auch der Gewinn.',
    (x0 + x1) / 2,
    ay,
    x1 - x0 - 12,
  );
  ctx.restore();
}

function drawFooter(ctx: Ctx, t: TicketTheme, serial: string | null): void {
  ctx.save();
  ctx.fillStyle = t.ink;
  ctx.globalAlpha = 0.75;
  ctx.textAlign = 'left';
  ctx.font = `500 10.5px ${FONT_MONO}`;
  ctx.fillText(
    'Gewinne werden sofort gutgeschrieben. Die Nervbox-Zentralbank haftet für nichts,',
    30,
    852,
    W - 60,
  );
  ctx.fillText(
    'insbesondere nicht für Admins. Glücksspiel kann süchtig machen. Mett auch.',
    30,
    866,
    W - 60,
  );
  ctx.globalAlpha = 1;
  ctx.font = `600 12px ${FONT_MONO}`;
  ctx.textAlign = 'right';
  ctx.fillText(serial ? `LOS ${serial}` : 'MUSTER · UNVERKÄUFLICH', W - 30, 884);
  // Strichcode
  const rand = rng(serial ? serial.length * 31 + serial.charCodeAt(serial.length - 1) : 3);
  let x = 30;
  while (x < 190) {
    const w = 1 + Math.floor(rand() * 3);
    ctx.fillRect(x, 874, w, 12);
    x += w + 1 + Math.floor(rand() * 3);
  }
  ctx.restore();
}

// ------------------------------------------------------------------ Folie

/** Bereiche, die von Folie bedeckt sind (fuer Abdeckungs-Messung) */
export function foilRegions(theme: TicketTheme): { cells: Rect[]; bonus: Rect | null } {
  const cells = Array.from({ length: 9 }, (_, i) => cellRect(i));
  const bonus =
    theme.key === 'mett'
      ? { x: BONUS.x - BONUS.r, y: BONUS.y - BONUS.r, w: BONUS.r * 2, h: BONUS.r * 2 }
      : null;
  return { cells, bonus };
}

export function drawFoil(ctx: Ctx, t: TicketTheme): void {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  const shape = (): void => {
    rr(ctx, { x: GRID.x - 4, y: GRID.y - 4, w: GRID.w + 8, h: GRID.h + 8 }, 8);
    if (t.key === 'mett') {
      ctx.moveTo(BONUS.x + BONUS.r + 2, BONUS.y);
      ctx.arc(BONUS.x, BONUS.y, BONUS.r + 2, 0, Math.PI * 2);
    }
  };
  shape();
  ctx.clip();

  // Metallverlauf
  const g = ctx.createLinearGradient(0, GRID.y, W, GRID.y + GRID.h + 200);
  t.foil.forEach((c, i) => g.addColorStop(i / (t.foil.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // gebuerstetes Metall
  const rand = rng(1234 + t.key.length);
  for (let k = 0; k < 700; k++) {
    const y = GRID.y - 10 + rand() * (H - GRID.y);
    ctx.globalAlpha = 0.05 + rand() * 0.08;
    ctx.fillStyle = rand() > 0.5 ? '#ffffff' : '#000000';
    ctx.fillRect(rand() * W, y, 20 + rand() * 120, 1);
  }
  // Glitzer
  for (let k = 0; k < 2200; k++) {
    ctx.globalAlpha = rand() * 0.35;
    ctx.fillStyle = rand() > 0.45 ? '#ffffff' : '#000000';
    ctx.fillRect(rand() * W, GRID.y - 10 + rand() * (H - GRID.y), 1.3, 1.3);
  }
  ctx.globalAlpha = 1;
  // Glanzbaender
  for (const [x0, a] of [
    [80, 0.28],
    [330, 0.18],
    [470, 0.12],
  ]) {
    const sg = ctx.createLinearGradient(x0, GRID.y, x0 + 160, GRID.y + 260);
    sg.addColorStop(0, 'rgba(255,255,255,0)');
    sg.addColorStop(0.5, `rgba(255,255,255,${a})`);
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, H);
  }

  // Praegung: Bankmuster schraeg
  ctx.save();
  ctx.translate(W / 2, GRID.y + GRID.h / 2);
  ctx.rotate(-0.32);
  ctx.font = `700 13px ${FONT_LOGO}`;
  ctx.textAlign = 'center';
  for (let row = -12; row <= 12; row++) {
    for (let col = -3; col <= 3; col++) {
      const x = col * 210 + (row % 2 ? 105 : 0);
      const y = row * 34;
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillText('NERVBOX ★ ZENTRALBANK', x - 1, y - 1);
      ctx.fillStyle = 'rgba(0,0,0,0.13)';
      ctx.fillText('NERVBOX ★ ZENTRALBANK', x + 1, y + 1);
    }
  }
  ctx.restore();

  // je Feld eine gepraegte Muenze mit "?"
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 9; i++) {
    const r = cellRect(i);
    const cx = r.x + r.w / 2,
      cy = r.y + r.h / 2;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx + 1, cy + 1, 30, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.stroke();
    ctx.font = `800 34px ${FONT_UI}`;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText('?', cx + 1, cy + 2);
    ctx.fillStyle = t.foilInk;
    ctx.globalAlpha = 0.55;
    ctx.fillText('?', cx, cy + 1);
    ctx.globalAlpha = 1;
  }
  // Feldtrenner
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  for (let k = 1; k < 3; k++) {
    const x = cellRect(k).x - GRID.gap / 2;
    const y = cellRect(k * 3).y - GRID.gap / 2;
    ctx.beginPath();
    ctx.moveTo(x, GRID.y);
    ctx.lineTo(x, GRID.y + GRID.h);
    ctx.moveTo(GRID.x, y);
    ctx.lineTo(GRID.x + GRID.w, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Aufschrift
  ctx.font = `800 15px ${FONT_UI}`;
  ctx.fillStyle = t.foilInk;
  ctx.globalAlpha = 0.6;
  ctx.fillText('HIER RUBBELN', GRID.x + GRID.w / 2, GRID.y + GRID.h - 4 - 6);
  if (t.key === 'mett') {
    ctx.font = `800 17px ${FONT_UI}`;
    ctx.fillText('BONUS', BONUS.x, BONUS.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Folienkante
  ctx.save();
  shape();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.stroke();
  ctx.restore();
}

/** Farbe fuer Rubbel-Spaene (aus der Folienpalette) */
export function flakeColor(t: TicketTheme): string {
  return t.foil[Math.floor(Math.random() * t.foil.length)];
}
