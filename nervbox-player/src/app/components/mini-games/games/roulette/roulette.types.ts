/**
 * Europaeisches Roulette (einfache Null) – Stammdaten, Wetttypen und Quoten.
 * Die Ziehung und die Auszahlung entscheidet der Server (CasinoRouletteController);
 * die Quoten hier dienen nur der Anzeige und muessen zum Backend passen.
 */

/** Kesselreihenfolge im Uhrzeigersinn, beginnend bei der Null */
export const WHEEL_ORDER: readonly number[] = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14,
  31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

export const RED_NUMBERS: ReadonlySet<number> = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

/** Muss zum Backend passen (CasinoRouletteController.MaxTotalBet) */
export const MAX_TOTAL_BET = 500;
export const CHIP_VALUES: readonly number[] = [5, 10, 50, 100];

export type RouletteColor = 'red' | 'black' | 'green';

export type BetType =
  'straight' | 'red' | 'black' | 'odd' | 'even' | 'low' | 'high' | 'dozen' | 'column';

export interface RouletteBet {
  type: BetType;
  /** straight: 0-36, dozen/column: 1-3, sonst 0 */
  value: number;
  amount: number;
}

export interface RouletteSpinResponse {
  number: number;
  color: RouletteColor;
  totalBet: number;
  payout: number;
  net: number;
  newBalance: number;
  bets: (RouletteBet & { won: boolean; payout: number })[];
}

export function colorOf(n: number): RouletteColor {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

export function betKey(type: BetType, value: number): string {
  return `${type}:${value}`;
}

/** Rueckzahlungsfaktor inkl. Einsatz (0 = verloren) */
export function payoutFactor(type: BetType, value: number, n: number): number {
  switch (type) {
    case 'straight':
      return value === n ? 36 : 0;
    case 'dozen':
      return n >= 1 && Math.floor((n - 1) / 12) + 1 === value ? 3 : 0;
    case 'column':
      return n >= 1 && ((n - 1) % 3) + 1 === value ? 3 : 0;
  }
  if (n === 0) return 0;
  switch (type) {
    case 'red':
      return RED_NUMBERS.has(n) ? 2 : 0;
    case 'black':
      return RED_NUMBERS.has(n) ? 0 : 2;
    case 'odd':
      return n % 2 === 1 ? 2 : 0;
    case 'even':
      return n % 2 === 0 ? 2 : 0;
    case 'low':
      return n <= 18 ? 2 : 0;
    case 'high':
      return n >= 19 ? 2 : 0;
  }
  return 0;
}

/** Anzeige-Quote z. B. "35:1" */
export function oddsLabel(type: BetType): string {
  if (type === 'straight') return '35:1';
  if (type === 'dozen' || type === 'column') return '2:1';
  return '1:1';
}

export function betLabel(type: BetType, value: number): string {
  switch (type) {
    case 'straight':
      return `Plein ${value}`;
    case 'dozen':
      return `${value}. Dutzend`;
    case 'column':
      return `${value}. Kolonne`;
    case 'red':
      return 'Rot';
    case 'black':
      return 'Schwarz';
    case 'odd':
      return 'Ungerade';
    case 'even':
      return 'Gerade';
    case 'low':
      return '1–18';
    case 'high':
      return '19–36';
  }
}
