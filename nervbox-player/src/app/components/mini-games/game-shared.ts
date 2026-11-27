/**
 * Gemeinsame Helfer der Minispiele.
 *
 * fitCanvas: skaliert ein Spielfeld (Canvas mit fester Engine-Aufloesung) per CSS auf den
 * verfuegbaren Platz im Dialog (Breite UND Hoehe, Seitenverhaeltnis bleibt). Die Engine-Aufloesung
 * bleibt unveraendert, die Pointer-Koordinaten werden von den Spielen ueber
 * getBoundingClientRect()/width umgerechnet.
 *
 * Das Canvas braucht dafuer in seinem Style:
 *   width: var(--fit-w, auto) !important; height: var(--fit-h, auto) !important;
 * (!important, damit z.B. KAPLAY seine eigenen Inline-Styles nicht gewinnt).
 */
export interface FitCanvasOptions {
  /** Element, dessen Innenbreite als verfuegbare Breite dient (Default: Eltern-Element des Canvas). */
  widthEl?: () => HTMLElement | null;
  /** Breite, die neben dem Canvas fuer andere Elemente reserviert wird (z.B. Seitenpanel). */
  reserveW?: () => number;
  /** Hoehe von Elementen, die unterhalb scrollen duerfen und nicht in die Hoehenrechnung eingehen. */
  excludeH?: () => number;
  /** Anteil der Fensterhoehe, den der Dialog maximal belegt (passend zu maxHeight 95dvh). */
  heightFactor?: number;
  /** Minimaler Skalierungsfaktor (Default 0.05); fuer Layouts, in denen der Rest scrollen darf. */
  minScale?: number;
  /** Maximaler Skalierungsfaktor (Default 1 = nie ueber native Aufloesung hinaus). */
  maxScale?: number | (() => number);
}

export function fitCanvas(
  getCanvas: () => HTMLCanvasElement | null | undefined,
  cw: number,
  ch: number,
  root: HTMLElement,
  opts: FitCanvasOptions = {},
): () => void {
  const factor = opts.heightFactor ?? 0.95;
  

  const apply = (): void => {
    const canvas = getCanvas();
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    // Canvas kurz minimieren, damit die uebrige Layout-Hoehe/-Breite messbar ist
    canvas.style.setProperty('--fit-w', '1px');
    canvas.style.setProperty('--fit-h', '1px');

    const pcs = getComputedStyle(parent);
    const padV = (parseFloat(pcs.paddingTop) || 0) + (parseFloat(pcs.paddingBottom) || 0);
    const widthEl = opts.widthEl?.() ?? parent;
    const wcs = getComputedStyle(widthEl);
    let availW =
      widthEl.clientWidth - (parseFloat(wcs.paddingLeft) || 0) - (parseFloat(wcs.paddingRight) || 0);
    availW -= opts.reserveW?.() ?? 0;
    if (widthEl !== parent) {
      availW -=
        (parseFloat(pcs.paddingLeft) || 0) + (parseFloat(pcs.paddingRight) || 0) +
        (parseFloat(pcs.borderLeftWidth) || 0) + (parseFloat(pcs.borderRightWidth) || 0);
    }
    const padV2 = padV + (parseFloat(pcs.borderTopWidth) || 0) + (parseFloat(pcs.borderBottomWidth) || 0);
    const chrome = root.scrollHeight - parent.offsetHeight - (opts.excludeH?.() ?? 0);
    const availH = window.innerHeight * factor - chrome - padV2;

    const maxScale = (typeof opts.maxScale === 'function' ? opts.maxScale() : opts.maxScale) ?? 1;
    const scale = Math.max(opts.minScale ?? 0.05, Math.min(availW / cw, availH / ch, maxScale));
    canvas.style.setProperty('--fit-w', `${Math.floor(cw * scale)}px`);
    canvas.style.setProperty('--fit-h', `${Math.floor(ch * scale)}px`);
  };

  apply();
  const raf = requestAnimationFrame(apply);
  const late = setTimeout(apply, 400);
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
  const ro = new ResizeObserver(apply);
  ro.observe(root);

  return () => {
    cancelAnimationFrame(raf);
    clearTimeout(late);
    window.removeEventListener('resize', apply);
    window.removeEventListener('orientationchange', apply);
    ro.disconnect();
  };
}
