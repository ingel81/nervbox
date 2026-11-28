import { hasWebGL, isWeakDevice } from '../deck3d/deck-support';

/**
 * Intro "Drop": Beim Laden fällt das Nervbox-Gerät in 3D auf den Tisch und
 * übergibt nahtlos an die echte Oberfläche.
 *
 * Abschalten: INTRO_ENABLED = false (global) – oder pro Browser
 * localStorage 'nervbox-intro-disabled' = '1' bzw. URL-Parameter ?nointro.
 */
export const INTRO_ENABLED = true;

/** Lokale Abschaltung (pro Browser). */
export const INTRO_DISABLE_KEY = 'nervbox-intro-disabled';
/** Erzwingt das Intro auch in automatisierten Browsern (Playwright-Tests). */
export const INTRO_FORCE_KEY = 'nervbox-intro-force';

export type IntroMode = 'none' | 'fade' | '3d';

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function decideIntroMode(): IntroMode {
  if (!INTRO_ENABLED || typeof window === 'undefined') return 'none';
  if (readStorage(INTRO_DISABLE_KEY) === '1') return 'none';
  if (/[?&]nointro\b/.test(location.search)) return 'none';
  // Automatisierte Browser (Playwright/Selenium) nicht 3 s blockieren
  if (navigator.webdriver && readStorage(INTRO_FORCE_KEY) !== '1') {
    return 'none';
  }
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return 'none';
  }
  if (readStorage(INTRO_FORCE_KEY) === 'fade') return 'fade';
  if (!hasWebGL() || isWeakDevice()) return 'fade';
  return '3d';
}
