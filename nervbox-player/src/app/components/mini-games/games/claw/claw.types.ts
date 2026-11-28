/** Hotdog-Greifer: gemeinsame Typen, Wurst-Stammdaten und API-Vertraege. */

export type SausageType = 'gurke' | 'wiener' | 'bratwurst' | 'kaese' | 'gold';

export interface SausageDef {
  type: SausageType;
  name: string;
  /** Laenge/Radius in Welt-Pixeln */
  len: number;
  rad: number;
  /** noetige Greifkraft (muss zur Server-Tabelle passen) */
  weight: number;
  /** Auszahlung x Einsatz (nur Anzeige, der Server zahlt aus seiner Tabelle) */
  mult: number;
  outline: string;
  base: string;
  dark: string;
  light: string;
}

export const SAUSAGES: Record<SausageType, SausageDef> = {
  gurke: {
    type: 'gurke',
    name: 'Saure Gurke',
    len: 84,
    rad: 19,
    weight: 0.15,
    mult: 0.3,
    outline: '#16240a',
    base: '#5b8a2c',
    dark: '#2e4f14',
    light: '#a3c95e',
  },
  wiener: {
    type: 'wiener',
    name: 'Wiener',
    len: 118,
    rad: 13.5,
    weight: 0.3,
    mult: 1.5,
    outline: '#3a150b',
    base: '#cc5a3a',
    dark: '#8a3220',
    light: '#f29a78',
  },
  bratwurst: {
    type: 'bratwurst',
    name: 'Bratwurst',
    len: 130,
    rad: 16,
    weight: 0.5,
    mult: 2,
    outline: '#2b1508',
    base: '#b36d3c',
    dark: '#6b391b',
    light: '#e6b083',
  },
  kaese: {
    type: 'kaese',
    name: 'Käsekrainer',
    len: 124,
    rad: 16,
    weight: 0.7,
    mult: 3,
    outline: '#3a150b',
    base: '#c2573c',
    dark: '#80301d',
    light: '#ee9b7c',
  },
  gold: {
    type: 'gold',
    name: 'Goldwurst',
    len: 124,
    rad: 15.5,
    weight: 0.9,
    mult: 10,
    outline: '#4a3406',
    base: '#e2b33a',
    dark: '#93690f',
    light: '#fff2a6',
  },
};

/** Anzeige-Reihenfolge der Auszahlungstabelle */
export const PAYOUT_ORDER: SausageType[] = ['gold', 'kaese', 'bratwurst', 'wiener', 'gurke'];

export interface PotItem {
  id: number;
  type: SausageType;
}

export interface ClawStateResponse {
  pot: PotItem[];
  stakes: number[];
  timeLimit: number;
}

export interface ClawStartResponse {
  tryId: string;
  seed: number;
  grip: number;
  stake: number;
  timeLimit: number;
  pot: PotItem[];
  newBalance: number;
}

export interface ClawFinishResponse {
  accepted: boolean;
  payout: number;
  type: SausageType | null;
  name: string | null;
  reason: string | null;
  pot: PotItem[];
  newBalance: number;
}

export type ClawPhase = 'idle' | 'aim' | 'drop' | 'grab' | 'lift' | 'carry' | 'release' | 'return';

export type TryOutcome = 'empty' | 'slipped' | 'missed' | 'delivered';

export interface TryResult {
  outcome: TryOutcome;
  sausageId?: number;
  type?: SausageType;
}

export interface TryParams {
  grip: number;
  seed: number;
  timeLimit: number;
}
