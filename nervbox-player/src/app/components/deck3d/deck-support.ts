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
