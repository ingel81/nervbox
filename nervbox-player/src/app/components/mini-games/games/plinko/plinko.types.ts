// Game State
export type PlinkoGameState = 'idle' | 'dropping' | 'result';

// Ball State
export interface PlinkoBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  active: boolean;
}

// Pin Configuration
export interface PlinkoPin {
  x: number;
  y: number;
  radius: number;
  hit?: boolean; // For visual feedback
}

// Slot (Multiplikator-Bereich unten)
export interface PlinkoSlot {
  x: number;
  width: number;
  multiplier: number;
  color: string;
}

// Multiplikator-Tabelle für 16 Rows (17 Slots)
// High-Style Verteilung: Ränder = hohe Multiplikatoren, Mitte = niedrige
// Aber mit moderateren Werten
export const MULTIPLIERS: number[] = [
  50, 25, 10, 5, 3, 1.5, 0.5, 0.3, 0.2,
  0.3, 0.5, 1.5, 3, 5, 10, 25, 50
];

// Alle gültigen Multiplikatoren für Backend-Validierung
export const VALID_MULTIPLIERS = [
  0.2, 0.3, 0.5, 1.5, 3, 5, 10, 25, 50
];

// Slot-Farben basierend auf Multiplikator
export function getSlotColor(multiplier: number): string {
  if (multiplier >= 100) return '#ef4444';  // Rot (extrem)
  if (multiplier >= 10) return '#f97316';   // Orange
  if (multiplier >= 2) return '#eab308';    // Gelb
  if (multiplier >= 1) return '#22c55e';    // Grün
  return '#9333ea';                          // Lila (Verlust)
}

// Slot-Hintergrundfarbe (transparent)
export function getSlotBgColor(multiplier: number): string {
  if (multiplier >= 100) return 'rgba(239, 68, 68, 0.3)';
  if (multiplier >= 10) return 'rgba(249, 115, 22, 0.3)';
  if (multiplier >= 2) return 'rgba(234, 179, 8, 0.3)';
  if (multiplier >= 1) return 'rgba(34, 197, 94, 0.3)';
  return 'rgba(147, 51, 234, 0.3)';
}
