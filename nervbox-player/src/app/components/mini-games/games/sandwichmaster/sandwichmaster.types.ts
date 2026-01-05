export type IngredientCategory = 'normal' | 'sauce' | 'rare' | 'epic';

export type GameState = 'shopping' | 'finished';

export interface Ingredient {
  id: string;
  name: string;
  emoji: string;
  cost: number;
  category: IngredientCategory;
  multiplier: number; // 1 for normal, >1 for epic
  color: string; // For rendering
  particleEffect?: ParticleEffectType;
}

export interface SelectedIngredient {
  ingredient: Ingredient;
  addedAt: number;
}

export type ParticleEffectType =
  | 'golden_sparkle' // Goldener Speck
  | 'flame' // Flammenkäse
  | 'lava' // Lava-Käse
  | 'dragon_fire' // Drachen-Chili-Soße
  | 'shadow' // Schattenfleisch
  | 'rainbow' // Mythisches Ur-Toast
  | 'stars' // Ewiger Käsekern
  | 'divine'; // Sandwich der Götter

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  alpha: number;
}

export interface ParticleEmitter {
  x: number;
  y: number;
  type: ParticleEffectType;
  particles: Particle[];
  active: boolean;
}

export interface SandwichLayer {
  ingredient: Ingredient;
  y: number;
  width: number;
  height: number;
}

export interface SpendCreditsResponse {
  success: boolean;
  amountSpent: number;
  newBalance: number;
  message: string;
}
