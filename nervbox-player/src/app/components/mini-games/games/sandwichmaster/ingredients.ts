import { Ingredient } from './sandwichmaster.types';

// Normale Zutaten (5-30 Shekel)
export const NORMAL_INGREDIENTS: Ingredient[] = [
  {
    id: 'toast',
    name: 'Toast',
    emoji: '🍞',
    cost: 5,
    category: 'normal',
    multiplier: 1,
    color: '#F5DEB3',
  },
  {
    id: 'vollkornbrot',
    name: 'Vollkornbrot',
    emoji: '🥖',
    cost: 7,
    category: 'normal',
    multiplier: 1,
    color: '#8B4513',
  },
  {
    id: 'zwiebel',
    name: 'Zwiebel',
    emoji: '🧅',
    cost: 6,
    category: 'normal',
    multiplier: 1,
    color: '#FFEFD5',
  },
  {
    id: 'rote_zwiebel',
    name: 'Rote Zwiebel',
    emoji: '🧅',
    cost: 8,
    category: 'normal',
    multiplier: 1,
    color: '#8B008B',
  },
  {
    id: 'kaese',
    name: 'Käse',
    emoji: '🧀',
    cost: 10,
    category: 'normal',
    multiplier: 1,
    color: '#FFD700',
  },
  {
    id: 'cheddar',
    name: 'Cheddar',
    emoji: '🧀',
    cost: 12,
    category: 'normal',
    multiplier: 1,
    color: '#FF8C00',
  },
  {
    id: 'peperoni',
    name: 'Peperoni',
    emoji: '🌶️',
    cost: 9,
    category: 'normal',
    multiplier: 1,
    color: '#FF4500',
  },
  {
    id: 'salat',
    name: 'Salat',
    emoji: '🥬',
    cost: 5,
    category: 'normal',
    multiplier: 1,
    color: '#90EE90',
  },
  {
    id: 'tomate',
    name: 'Tomate',
    emoji: '🍅',
    cost: 6,
    category: 'normal',
    multiplier: 1,
    color: '#FF6347',
  },
  {
    id: 'gurke',
    name: 'Gurke',
    emoji: '🥒',
    cost: 6,
    category: 'normal',
    multiplier: 1,
    color: '#32CD32',
  },
  {
    id: 'mais',
    name: 'Mais',
    emoji: '🌽',
    cost: 7,
    category: 'normal',
    multiplier: 1,
    color: '#FFD700',
  },
  {
    id: 'speck',
    name: 'Speck',
    emoji: '🥓',
    cost: 15,
    category: 'normal',
    multiplier: 1,
    color: '#CD5C5C',
  },
  {
    id: 'schinken',
    name: 'Schinken',
    emoji: '🍖',
    cost: 14,
    category: 'normal',
    multiplier: 1,
    color: '#FFB6C1',
  },
  {
    id: 'spiegelei',
    name: 'Spiegelei',
    emoji: '🍳',
    cost: 12,
    category: 'normal',
    multiplier: 1,
    color: '#FFFF00',
  },
];

// Soßen (7-25 Shekel)
export const SAUCE_INGREDIENTS: Ingredient[] = [
  {
    id: 'ketchup',
    name: 'Ketchup',
    emoji: '🍅',
    cost: 8,
    category: 'sauce',
    multiplier: 1,
    color: '#DC143C',
  },
  {
    id: 'mayonnaise',
    name: 'Mayonnaise',
    emoji: '🥚',
    cost: 8,
    category: 'sauce',
    multiplier: 1,
    color: '#FFFACD',
  },
  {
    id: 'senf',
    name: 'Senf',
    emoji: '🟡',
    cost: 7,
    category: 'sauce',
    multiplier: 1,
    color: '#DAA520',
  },
  {
    id: 'bbq_sosse',
    name: 'BBQ-Soße',
    emoji: '🔥',
    cost: 12,
    category: 'sauce',
    multiplier: 1,
    color: '#8B0000',
  },
  {
    id: 'chili_sosse',
    name: 'Chili-Soße',
    emoji: '🌶️',
    cost: 15,
    category: 'sauce',
    multiplier: 1,
    color: '#FF0000',
  },
  {
    id: 'knoblauch_sosse',
    name: 'Knoblauch-Soße',
    emoji: '🧄',
    cost: 10,
    category: 'sauce',
    multiplier: 1,
    color: '#F5F5DC',
  },
  {
    id: 'trueffel_mayo',
    name: 'Trüffel-Mayonnaise',
    emoji: '🍄',
    cost: 25,
    category: 'sauce',
    multiplier: 1,
    color: '#2F4F4F',
  },
];

// Seltene Zutaten (40-80 Shekel)
export const RARE_INGREDIENTS: Ingredient[] = [
  {
    id: 'doppelter_speck',
    name: 'Doppelter Speck',
    emoji: '🥓',
    cost: 40,
    category: 'rare',
    multiplier: 1,
    color: '#B22222',
  },
  {
    id: 'extra_kaese_mix',
    name: 'Extra Käse-Mix',
    emoji: '🧀',
    cost: 45,
    category: 'rare',
    multiplier: 1,
    color: '#FFD700',
  },
  {
    id: 'geraeuchertes_fleisch',
    name: 'Geräuchertes Fleisch',
    emoji: '🍖',
    cost: 60,
    category: 'rare',
    multiplier: 1,
    color: '#8B4513',
  },
  {
    id: 'jalapeno_deluxe',
    name: 'Jalapeño Deluxe',
    emoji: '🌶️',
    cost: 50,
    category: 'rare',
    multiplier: 1,
    color: '#228B22',
  },
  {
    id: 'knusprige_zwiebelringe',
    name: 'Knusprige Zwiebelringe',
    emoji: '🧅',
    cost: 55,
    category: 'rare',
    multiplier: 1,
    color: '#DAA520',
  },
  {
    id: 'avocado',
    name: 'Avocado',
    emoji: '🥑',
    cost: 70,
    category: 'rare',
    multiplier: 1,
    color: '#9ACD32',
  },
  {
    id: 'mozzarella_baellchen',
    name: 'Mozzarella-Bällchen',
    emoji: '⚪',
    cost: 65,
    category: 'rare',
    multiplier: 1,
    color: '#FFFAFA',
  },
];

// Epische Materialien (100-1000 Shekel) - Max 1x pro Sandwich
export const EPIC_INGREDIENTS: Ingredient[] = [
  // 100 Shekel - x2 Multiplikator
  {
    id: 'goldener_speck',
    name: 'Goldener Speck',
    emoji: '✨',
    cost: 100,
    category: 'epic',
    multiplier: 2,
    color: '#FFD700',
    particleEffect: 'golden_sparkle',
  },
  {
    id: 'flammenkaese',
    name: 'Flammenkäse',
    emoji: '🔥',
    cost: 100,
    category: 'epic',
    multiplier: 2,
    color: '#FF4500',
    particleEffect: 'flame',
  },
  // 500 Shekel - x5 Multiplikator
  {
    id: 'lava_kaese',
    name: 'Lava-Käse',
    emoji: '🌋',
    cost: 500,
    category: 'epic',
    multiplier: 5,
    color: '#FF6600',
    particleEffect: 'lava',
  },
  {
    id: 'drachen_chili_sosse',
    name: 'Drachen-Chili-Soße',
    emoji: '🐉',
    cost: 500,
    category: 'epic',
    multiplier: 5,
    color: '#8B0000',
    particleEffect: 'dragon_fire',
  },
  {
    id: 'schattenfleisch',
    name: 'Schattenfleisch',
    emoji: '👤',
    cost: 500,
    category: 'epic',
    multiplier: 5,
    color: '#1a1a2e',
    particleEffect: 'shadow',
  },
  // 1000 Shekel - x10 Multiplikator
  {
    id: 'mythisches_ur_toast',
    name: 'Mythisches Ur-Toast',
    emoji: '🌈',
    cost: 1000,
    category: 'epic',
    multiplier: 10,
    color: '#FF69B4',
    particleEffect: 'rainbow',
  },
  {
    id: 'ewiger_kaesekern',
    name: 'Ewiger Käsekern',
    emoji: '💫',
    cost: 1000,
    category: 'epic',
    multiplier: 10,
    color: '#FFFF00',
    particleEffect: 'stars',
  },
  {
    id: 'sandwich_der_goetter',
    name: 'Sandwich der Götter',
    emoji: '👑',
    cost: 1000,
    category: 'epic',
    multiplier: 10,
    color: '#9400D3',
    particleEffect: 'divine',
  },
];

// Alle Zutaten zusammen
export const ALL_INGREDIENTS: Ingredient[] = [
  ...NORMAL_INGREDIENTS,
  ...SAUCE_INGREDIENTS,
  ...RARE_INGREDIENTS,
  ...EPIC_INGREDIENTS,
];

// Hilfsfunktion: Zutat nach ID finden
export function getIngredientById(id: string): Ingredient | undefined {
  return ALL_INGREDIENTS.find(i => i.id === id);
}

// Hilfsfunktion: Zutaten nach Kategorie filtern
export function getIngredientsByCategory(
  category: 'normal' | 'sauce' | 'rare' | 'epic'
): Ingredient[] {
  switch (category) {
    case 'normal':
      return NORMAL_INGREDIENTS;
    case 'sauce':
      return SAUCE_INGREDIENTS;
    case 'rare':
      return RARE_INGREDIENTS;
    case 'epic':
      return EPIC_INGREDIENTS;
    default:
      return [];
  }
}
