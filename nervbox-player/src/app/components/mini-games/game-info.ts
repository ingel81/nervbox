/**
 * Stammdaten der Minispiele (Spielhalle + Spielrahmen): Titel, Symbol, Akzentfarbe, Baujahr.
 * Die Akzentfarbe ist die Etikettfarbe des Steckmoduls und faerbt im Spielrahmen
 * Titel-Linse, Bildschirmkante und die Overlay-Karten.
 */
export type GameKey =
  | 'arkanoid'
  | 'hotdog'
  | 'plinko'
  | 'slot'
  | 'kayberg'
  | 'weinfest'
  | 'sandwich'
  | 'roulette'
  | 'pong'
  | 'scratch'
  | 'claw';

export interface GameInfo {
  key: GameKey;
  title: string;
  icon: string;
  accent: string;
  year: number;
}

export const GAME_INFO: Record<GameKey, GameInfo> = {
  arkanoid: {
    key: 'arkanoid',
    title: 'Arkanoid',
    icon: 'sports_tennis',
    accent: '#4E7BA6',
    year: 2025,
  },
  hotdog: {
    key: 'hotdog',
    title: 'Hotdog Katapult',
    icon: 'lunch_dining',
    accent: '#B8702A',
    year: 2025,
  },
  plinko: { key: 'plinko', title: 'Plinko', icon: 'scatter_plot', accent: '#93271F', year: 2025 },
  slot: { key: 'slot', title: 'N$ Fortune', icon: 'casino', accent: '#7E6212', year: 2025 },
  kayberg: {
    key: 'kayberg',
    title: 'Kayberg Hunter',
    icon: 'flight',
    accent: '#22635F',
    year: 2025,
  },
  weinfest: {
    key: 'weinfest',
    title: 'Weinfest Shooter',
    icon: 'wine_bar',
    accent: '#7A2E4A',
    year: 2025,
  },
  sandwich: {
    key: 'sandwich',
    title: 'Sandwichmaster',
    icon: 'bakery_dining',
    accent: '#5E7426',
    year: 2026,
  },
  roulette: {
    key: 'roulette',
    title: 'Roulette',
    icon: 'adjust',
    accent: '#1E6B42',
    year: 2026,
  },
  pong: {
    key: 'pong',
    title: 'LAN-Pong',
    icon: 'settings_ethernet',
    accent: '#2F6E8C',
    year: 2026,
  },
  scratch: {
    key: 'scratch',
    title: 'Rubbellos',
    icon: 'confirmation_number',
    accent: '#4A6F7A',
    year: 2026,
  },
  claw: {
    key: 'claw',
    title: 'Hotdog-Greifer',
    icon: 'soup_kitchen',
    accent: '#9A4A2E',
    year: 2026,
  },
};
