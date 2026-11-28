/** Kann dieser Browser/Rechner die 3D-Szene (Intro, 3D-Ansicht) sinnvoll darstellen? */

let webgl: boolean | null = null;

export function hasWebGL(): boolean {
  if (webgl === null) {
    try {
      const c = document.createElement('canvas');
      webgl = !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
      webgl = false;
    }
  }
  return webgl;
}

/** Schwache Geräte (und die Pi-Kiste) bekommen kein 3D. */
export function isWeakDevice(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number };
  if ((nav.hardwareConcurrency ?? 4) <= 2) return true;
  if (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) return true;
  return /Linux (aarch64|armv7l|armv8)/i.test(nav.userAgent);
}

/**
 * WebKit (Safari auf dem Mac, alle Browser auf iPhone/iPad): Die CSS-matrix3d-
 * Projektion der echten Oberfläche lag im Test (WebKit) neben dem Gehäuse.
 * Bis das auf echten Apple-Geräten geprüft ist, gibt es dort kein 3D.
 */
export function isWebKitEngine(): boolean {
  const ua = navigator.userAgent;
  const iOS =
    /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (iOS) return true;
  return /AppleWebKit/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Android/i.test(ua);
}
