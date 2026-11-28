/**
 * Rubbellos der Nervbox-Zentralbank: Datentypen, Los-Themen und Layout des Losbogens.
 * Gewinnplaene (Symbole, Preise) kommen vom Server (GET /api/casino/scratch/tickets);
 * hier liegt nur die Optik (Emoji, Farben, Gag-Texte) je Symbol-ID.
 */

export type TicketKey = 'holz' | 'tresor' | 'mett';

export interface ScratchSymbolInfo {
  id: string;
  name: string;
  prize: number;
}

export interface ScratchTicketInfo {
  key: TicketKey;
  name: string;
  price: number;
  rtp: number;
  winChance: number;
  symbols: ScratchSymbolInfo[];
  bonus?: number[];
}

export interface ScratchBuyResponse {
  ticketType: TicketKey;
  serial: string;
  price: number;
  grid: string[];
  winSymbol?: string;
  winCells: number[];
  bonus?: number;
  payout: number;
  credited: number;
  confiscated: boolean;
  confiscatedSymbol?: string;
  newBalance: number;
}

export const WILD = 'wild';
export const ADMIN = 'admin';

/** Logische Losgroesse (Canvas-Koordinaten, Backing-Store ggf. x2 fuer Retina) */
export const W = 600;
export const H = 900;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Rubbelfeld (3x3) */
export const GRID: Rect & { gap: number } = { x: 40, y: 214, w: 520, h: 414, gap: 10 };
/** Bonusfeld (nur Mett-Igel-Jackpot) */
export const BONUS = { x: 104, y: 742, r: 54 };

export function cellRect(i: number): Rect {
  const cw = (GRID.w - GRID.gap * 2) / 3;
  const ch = (GRID.h - GRID.gap * 2) / 3;
  const c = i % 3;
  const r = Math.floor(i / 3);
  return { x: GRID.x + c * (cw + GRID.gap), y: GRID.y + r * (ch + GRID.gap), w: cw, h: ch };
}

export interface TicketTheme {
  key: TicketKey;
  /** Kurzname fuer schmale Auswahl (Handy) */
  short: string;
  /** Farbe im Auswahl-Stummel und Spielrahmen */
  color: string;
  tagline: string;
  paper: string;
  paper2: string;
  ink: string;
  accent: string;
  accentInk: string;
  /** Metallfolie: Verlaufsstopps */
  foil: string[];
  foilInk: string;
  cell: 'slice' | 'vault' | 'bun';
  icon: string;
}

export const THEMES: Record<TicketKey, TicketTheme> = {
  holz: {
    key: 'holz',
    short: 'HOLZ',
    color: '#8A5426',
    tagline: 'Rubbeln, bis die Späne fliegen.',
    paper: '#efe0bd',
    paper2: '#dcc493',
    ink: '#3b2412',
    accent: '#6e3f19',
    accentInk: '#fff1d6',
    foil: ['#6f4426', '#c98b5a', '#93582f', '#f2c79c', '#a66a3c', '#734626'],
    foilInk: '#4a2a14',
    cell: 'slice',
    icon: 'forest',
  },
  tresor: {
    key: 'tresor',
    short: 'TRESOR',
    color: '#2F6B4F',
    tagline: 'Ihr Geld. Unser Tresor. Vertrauen seit 1996.',
    paper: '#e4e8dc',
    paper2: '#c9d3c0',
    ink: '#16301f',
    accent: '#1f4d36',
    accentInk: '#eef6e6',
    foil: ['#6f757c', '#d9dde1', '#979ca3', '#fbfcfd', '#a7acb2', '#70767d'],
    foilInk: '#3f454b',
    cell: 'vault',
    icon: 'account_balance',
  },
  mett: {
    key: 'mett',
    short: 'METT',
    color: '#A3392C',
    tagline: 'Mit Zwiebeln. Ohne Gewähr.',
    paper: '#f4e1cf',
    paper2: '#e6c3a6',
    ink: '#4a1a12',
    accent: '#93302a',
    accentInk: '#fff0e4',
    foil: ['#80621a', '#e9c866', '#ab8628', '#fff0b3', '#c19a36', '#86661c'],
    foilInk: '#5a4310',
    cell: 'bun',
    icon: 'restaurant',
  },
};

export interface SymbolArt {
  emoji?: string;
  gold?: boolean;
  draw?: 'bar' | 'wild' | 'admin';
  label: string;
}

/** Optik je Symbol-ID (Namen/Preise liefert der Server) */
export const SYMBOL_ART: Record<string, SymbolArt> = {
  // Holzfaeller-Glueck
  tanne: { emoji: '🌲', label: 'TANNE' },
  axt: { emoji: '🪓', label: 'AXT' },
  saege: { emoji: '🪚', label: 'SÄGE' },
  scheit: { emoji: '🪵', label: 'SCHEIT' },
  hirsch: { emoji: '🦌', label: 'HIRSCH' },
  eule: { emoji: '🦉', label: 'EULE' },
  goldscheit: { emoji: '🪵', gold: true, label: 'GOLDSCHEIT' },
  // Zentralbank-Tresor
  muenze: { emoji: '🪙', label: 'MÜNZE' },
  schwein: { emoji: '🐷', label: 'SPARSCHWEIN' },
  schluessel: { emoji: '🔑', label: 'SCHLÜSSEL' },
  schein: { emoji: '📜', label: 'SCHULDSCHEIN' },
  barren: { draw: 'bar', label: 'GOLDBARREN' },
  diamant: { emoji: '💎', label: 'DIAMANT' },
  tresor: { emoji: '🏦', gold: true, label: 'TRESOR' },
  // Mett-Igel-Jackpot
  zwiebel: { emoji: '🧅', label: 'ZWIEBEL' },
  broetchen: { emoji: '🥖', label: 'BRÖTCHEN' },
  pfeffer: { emoji: '🧂', label: 'PFEFFER' },
  gurke: { emoji: '🥒', label: 'GURKE' },
  bier: { emoji: '🍺', label: 'FEIERABEND' },
  igel: { emoji: '🦔', label: 'METT-IGEL' },
  goldigel: { emoji: '🦔', gold: true, label: 'GOLD-IGEL' },
  // Sonderfelder
  wild: { draw: 'wild', label: 'JOKER' },
  admin: { draw: 'admin', label: 'ADMIN' },
};

export const LOSS_LINES = [
  'Leider nein. Die Zentralbank bedankt sich für Ihre Spende.',
  'Ihr Geld ist jetzt in sicheren Händen. In unseren.',
  'Knapp daneben ist auch vorbei.',
  'Ihr Einsatz finanziert die neue Kaffeemaschine im Tresorraum.',
  'Kopf hoch – das Los war wenigstens schön glänzend.',
  'Vertrauen seit 1996. Gewinne seit … demnächst.',
  'Die Bank gewinnt immer. Sie ist schließlich die Bank.',
  'Statistisch gesehen war das nächste Los das richtige.',
  'Kein Gewinn – aber die Rubbelspäne dürfen Sie behalten.',
];

export const WIN_LINES = [
  'Die Zentralbank zahlt aus. Bitte nicht weitersagen.',
  'Gewinn bereits gutgeschrieben – Vertrauen seit 1996!',
  'Der Tresor wackelt. Ein bisschen.',
  'Glückwunsch! Der Kassenwart weint leise.',
];

export const ADMIN_LINES = [
  'Der Admin hat Ihren Gewinn zur Prüfung einbehalten. Bearbeitungszeit: ca. 30 Jahre.',
  'Beschlagnahmt! Der Admin braucht das Geld dringender. Für Server. Bestimmt.',
  'Gewinn erkannt, Admin erkannt, Gewinn weg. So ist das Leben.',
];

export const BREAK_EVEN_LINES = [
  'Geld zurück! Immerhin hat das Rubbeln Spaß gemacht.',
  'Null auf null – die Zentralbank nennt das „Stabilität“.',
];

export function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}
