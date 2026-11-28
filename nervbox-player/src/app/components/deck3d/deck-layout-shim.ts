/**
 * Layout-Maße trotz 3D-Projektion.
 *
 * Das virtuelle Scrollen der Pad-Liste (Angular CDK) berechnet den sichtbaren Bereich aus
 * `getBoundingClientRect()` von Scroll-Container und Viewport. Unter der 3D-Projektion des Geräts
 * sind diese Rechtecke gestaucht und perspektivisch verzerrt – die Liste würde falsche Zeilen
 * rendern (leere Flächen beim Scrollen). Solange das Gerät projiziert ist, bekommen deshalb genau
 * diese beiden Elemente ihr unverzerrtes Layout-Rechteck zurück; alle anderen Aufrufe (Menüs,
 * Tooltips, Tour …) sehen weiterhin die tatsächliche Lage auf dem Bildschirm.
 */

const LAYOUT_CLASSES = ['cdk-virtual-scroll-viewport', 'cdk-virtual-scrollable'];

let installed = 0;
let original: (() => DOMRect) | null = null;
let root: HTMLElement | null = null;

/** Aktivieren; gibt die Funktion zum Abschalten zurück. */
export function installLayoutShim(device: HTMLElement): () => void {
  root = device;
  if (installed++ === 0) {
    const proto = Element.prototype;
    const orig = proto.getBoundingClientRect;
    original = orig;
    proto.getBoundingClientRect = function (this: Element): DOMRect {
      const dev = root;
      if (dev && dev !== this) {
        const t = dev.style.transform;
        if (t && t !== 'none' && this.classList) {
          for (const c of LAYOUT_CLASSES) {
            if (this.classList.contains(c) && dev.contains(this)) {
              // Transform-Wechsel kostet kein Layout; es entsteht kein Bild dazwischen
              dev.style.transform = 'none';
              const r = orig.call(this);
              dev.style.transform = t;
              return r;
            }
          }
        }
      }
      return orig.call(this);
    };
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    if (--installed === 0 && original) {
      Element.prototype.getBoundingClientRect = original;
      original = null;
      root = null;
    }
  };
}
