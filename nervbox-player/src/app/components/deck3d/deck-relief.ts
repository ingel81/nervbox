import { clamp, parseColor } from './deck-util';

/**
 * Relief der Bedienelemente: Pads und Tasten stehen physisch aus dem Gerät heraus, LCD, Schächte
 * und Platten liegen vertieft.
 *
 * Die projizierte DOM-Ebene kann keine echte Tiefe (Vorfahren mit `overflow` verhindern
 * `preserve-3d`). Deshalb:
 *  - Jede Tasten-Oberseite wird per `translate` dorthin verschoben, wo die um ihre Höhe angehobene
 *    Fläche aus Sicht der Kamera läge (Parallaxe, exakt aus der Kameraposition berechnet).
 *  - Flanken, Schächte und Schlagschatten zeichnet ein 2D-Canvas in der Geräteebene über dem DOM;
 *    die Oberseiten werden ausgestanzt. Elemente in Scroll-Containern bekommen ein eigenes Canvas
 *    IM Container – es scrollt nativ mit, nichts „schwimmt“ beim Scrollen.
 *  - Bei Höhe 0 (Kamera senkrecht von oben) bleibt exakt die unveränderte Oberfläche übrig.
 *
 * Die schwarzen Schächte der Tasten (Box-Shadow-Ringe) bleiben an der Grundfläche: Solange das
 * Relief aktiv ist, blendet CSS sie am Element aus (`[data-nb-raised]`, styles/nacht/_20-view3d.scss)
 * und das Canvas zeichnet sie deckungsgleich nach.
 */

export interface ReliefView {
  /** Kamera im Rahmen der Oberseite (DOM-px; n = Höhe über der Fläche) */
  cu: number;
  cv: number;
  cn: number;
  /** Lampe im selben Rahmen */
  lu: number;
  lv: number;
  ln: number;
  /** Höhenfaktor 0…1 (0 = flach) */
  k: number;
  /** Stärke des Lampenreflexes auf der Oberfläche 0…1 */
  sheen: number;
}

/** Ring an der Grundfläche (entspricht einem Box-Shadow mit Spread) */
interface Ring {
  s: number;
  dx: number;
  dy: number;
  c: string;
}

interface Info {
  cls: string;
  /** Höhe in px bei 1400 px Gerätebreite; negativ = versenkt */
  h: number;
  rings: Ring[];
  wall: [number, number, number];
  glass: boolean;
  /** Eckradius: Wert und ob Prozent */
  rad: number;
  radPct: boolean;
}

interface Clip {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Item {
  el: HTMLElement;
  info: Info;
  layer: Layer;
  /** Grundfläche in Ebenenkoordinaten */
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  clip: Clip | null;
  /** 1 = oben, kleiner = eingedrückt */
  press: number;
  pressTarget: number;
  /** angewandte Verschiebung der Oberseite (versenkt: Verschiebung des Bodens) */
  ox: number;
  oy: number;
  /** Schlagschatten-Versatz */
  sx: number;
  sy: number;
  /** wirksame Höhe (px) */
  hh: number;
  gen: number;
  marked: boolean;
  moved: boolean;
}

interface Layer {
  host: HTMLElement;
  scroller: boolean;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** kleines Hilfs-Canvas: Schlagschatten deckend zeichnen, dann weich und halbtransparent einblenden */
  shadow: HTMLCanvasElement;
  sctx: CanvasRenderingContext2D;
  q: number;
  /** Ursprung in Gerätekoordinaten (Scroller: Inhaltsursprung bei Scroll 0) */
  hx: number;
  hy: number;
  scrollX: number;
  scrollY: number;
  /** Canvas-Fenster in Ebenenkoordinaten */
  winY: number;
  winW: number;
  winH: number;
  viewH: number;
  contentH: number;
  margin: number;
  items: Item[];
  gen: number;
}

const WELL_C = '#090807';
const SEAT: Ring[] = [
  { s: 3.5, dx: 0, dy: 0, c: WELL_C },
  { s: 3.5, dx: 1.5, dy: 1.5, c: 'rgba(255,226,176,0.15)' },
  { s: 3.5, dx: -1, dy: -1, c: 'rgba(0,0,0,0.6)' },
];
const WELL: Ring[] = [
  { s: 3, dx: 0, dy: 0, c: WELL_C },
  { s: 3, dx: 1.5, dy: 1.5, c: 'rgba(255,226,176,0.17)' },
  { s: 3, dx: -1, dy: -1, c: 'rgba(0,0,0,0.5)' },
];
const PLAIN: Ring[] = [{ s: 3, dx: 0, dy: 0, c: WELL_C }];
const SELECTED: Ring[] = [{ s: 4.5, dx: 0, dy: 0, c: WELL_C }];
const COLLAR: Ring[] = [
  { s: 3, dx: 0, dy: 0, c: WELL_C },
  { s: 7, dx: 0, dy: 0, c: '#4b453a' },
  { s: 7, dx: 1.5, dy: 1.5, c: 'rgba(255,226,176,0.2)' },
  { s: 7, dx: -1, dy: -1, c: 'rgba(0,0,0,0.5)' },
];
const NONE: Ring[] = [];

const RAISED_SEL = '.nk-pad, .nk-key, .nk-select, .nk-tag, .nk-tabs__tab, .nk-quickkey';
const RECESS_SEL =
  '.nk-lcd, .nk-counter, .nk-input, .nk-rail, .nk-plate, .nk-printer, .nk-channel, .nk-logo, .nk-switch';
const ALL_SEL = `${RAISED_SEL}, ${RECESS_SEL}`;
const PUTTY: [number, number, number] = [90, 83, 70];

/** Lichtspalt um die Oberseite bleibt sichtbar (1 px Rand der Tasten) */
const RIM = 1;
const ATTR = 'data-nb-raised';
const ROOT_CLASS = 'nb-relief';
/** Schlagschatten werden in 1/n Auflösung gezeichnet (weiche Kante beim Hochskalieren) */
const SHADOW_DIV = 3;
/** so weit sinkt eine gedrückte Taste (Anteil ihrer Höhe, der stehen bleibt) */
const PRESS_DOWN = 0.3;

export class DeckRelief {
  private readonly layers = new Map<HTMLElement, Layer>();
  private readonly items = new Map<HTMLElement, Item>();
  private readonly infos = new WeakMap<HTMLElement, { cls: string; info: Info | null }>();
  private view: ReliefView = { cu: 0, cv: 0, cn: 1000, lu: 0, lv: 0, ln: 2000, k: 0, sheen: 0 };
  private W = 1;
  private H = 1;
  private scale = 1;
  private gen = 0;
  private active = false;
  private disposed = false;
  private animating = false;
  private readonly dpr = Math.min(window.devicePixelRatio || 1, 2);
  private readonly mo: MutationObserver;
  private readonly ro: ResizeObserver;
  private readonly observed = new WeakSet<Element>();

  constructor(private readonly device: HTMLElement) {
    // DOM-Änderungen (Sounds geladen, Filter, virtuelles Scrollen, Zustandsklassen) noch vor dem
    // nächsten Bild nachziehen, damit Canvas und DOM nie auseinanderlaufen
    this.mo = new MutationObserver((records) => {
      if (this.disposed) return;
      for (const r of records) {
        if (r.type === 'attributes') {
          if ((r.target as Element).matches(ALL_SEL)) return this.refresh();
        } else if (!this.ownNodes(r.addedNodes) || !this.ownNodes(r.removedNodes)) {
          return this.refresh();
        }
      }
    });
    this.mo.observe(device, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'aria-pressed'],
    });
    this.ro = new ResizeObserver(() => {
      if (!this.disposed) this.refresh();
    });
    this.refresh();
  }

  private ownNodes(list: NodeList): boolean {
    for (const n of Array.from(list)) {
      if (!(n instanceof HTMLCanvasElement) || !n.classList.contains('nb-relief-canvas')) {
        return false;
      }
    }
    return true;
  }

  /**
   * Layoutänderungen ohne DOM-Mutation (Chatbreite, Fenster) über die Strukturelemente erkennen.
   * Jedes Element nur einmal anmelden – erneutes `observe` würde sofort wieder auslösen.
   */
  private observeStructure(): void {
    const watch = (el: Element): void => {
      if (this.observed.has(el)) return;
      this.observed.add(el);
      this.ro.observe(el);
    };
    watch(this.device);
    for (const el of Array.from(this.device.children)) watch(el);
    for (const el of Array.from(
      this.device.querySelectorAll('.app-body > *, .nk-plate, .nk-rail'),
    )) {
      watch(el);
    }
  }

  // ------------------------------------------------------------------ Erfassen

  /** Elemente neu erfassen und vermessen (Layout-Lesezugriffe gebündelt). */
  refresh(): void {
    if (this.disposed) return;
    const dev = this.device;
    const prevT = dev.style.transform;
    dev.style.transform = 'none';
    // eigene Canvases dürfen die Scrollhöhe nicht verfälschen
    for (const L of this.layers.values()) {
      if (L.scroller) {
        L.canvas.style.top = '0px';
        L.canvas.style.height = '0px';
      }
    }
    const dr = dev.getBoundingClientRect();
    this.W = dr.width;
    this.H = dr.height;
    this.scale = clamp(dr.width / 1400, 0.6, 1.1);
    const gen = ++this.gen;

    const hostCache = new Map<Element, { layer: HTMLElement; clip: HTMLElement | null }>();
    const rectCache = new Map<HTMLElement, DOMRect>();
    const hostOf = (el: Element | null): { layer: HTMLElement; clip: HTMLElement | null } => {
      if (!el || el === dev) return { layer: dev, clip: null };
      const hit = hostCache.get(el);
      if (hit) return hit;
      const cs = getComputedStyle(el);
      let res: { layer: HTMLElement; clip: HTMLElement | null };
      if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX)) {
        // Scroll-Container: eigenes, mitscrollendes Canvas – braucht einen Positionierungsanker
        res =
          cs.position !== 'static'
            ? { layer: el as HTMLElement, clip: null }
            : { layer: dev, clip: el as HTMLElement };
      } else {
        res = hostOf(el.parentElement);
      }
      hostCache.set(el, res);
      return res;
    };
    const rectOf = (el: HTMLElement): DOMRect => {
      let r = rectCache.get(el);
      if (!r) {
        r = el.getBoundingClientRect();
        rectCache.set(el, r);
      }
      return r;
    };

    this.observeStructure();
    const els = dev.querySelectorAll<HTMLElement>(ALL_SEL);
    for (const el of Array.from(els)) {
      const info = this.infoOf(el);
      if (!info) continue;
      // verschachtelte Tasten (Taste auf einem Pad) gehören zur äußeren Oberseite
      if (info.h > 0 && el.parentElement?.closest(RAISED_SEL)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      const host = hostOf(el.parentElement);
      const layer = this.layerFor(host.layer, dr, rectOf);
      let item = this.items.get(el);
      // eigene Verschiebung herausrechnen
      const ax = item && item.moved ? item.ox : 0;
      const ay = item && item.moved ? item.oy : 0;
      let x: number;
      let y: number;
      if (layer.scroller) {
        const sr = rectOf(layer.host);
        x = r.left - ax - sr.left - layer.host.clientLeft + layer.scrollX;
        y = r.top - ay - sr.top - layer.host.clientTop + layer.scrollY;
      } else {
        x = r.left - ax - dr.left;
        y = r.top - ay - dr.top;
        if (x > this.W || y > this.H || x + r.width < 0 || y + r.height < 0) continue;
      }
      let clip: Clip | null = null;
      if (host.clip) {
        const cr = rectOf(host.clip);
        clip = { x: cr.left - dr.left, y: cr.top - dr.top, w: cr.width, h: cr.height };
      }
      if (!item) {
        item = {
          el,
          info,
          layer,
          x,
          y,
          w: r.width,
          h: r.height,
          r: 0,
          clip,
          press: 1,
          pressTarget: 1,
          ox: 0,
          oy: 0,
          sx: 0,
          sy: 0,
          hh: 0,
          gen,
          marked: false,
          moved: false,
        };
        this.items.set(el, item);
      } else {
        if (item.layer !== layer) {
          const list = item.layer.items;
          const i = list.indexOf(item);
          if (i >= 0) list.splice(i, 1);
        }
        item.info = info;
        item.x = x;
        item.y = y;
        item.w = r.width;
        item.h = r.height;
        item.clip = clip;
        item.gen = gen;
      }
      const rad = info.radPct ? (Math.min(r.width, r.height) * info.rad) / 100 : info.rad;
      item.r = Math.min(rad, r.width / 2, r.height / 2);
      if (item.layer !== layer || !layer.items.includes(item)) {
        item.layer = layer;
        layer.items.push(item);
      }
    }
    dev.style.transform = prevT;

    // Verschwundenes aufräumen
    for (const [el, item] of this.items) {
      if (item.gen === gen) continue;
      this.release(item);
      this.items.delete(el);
      const list = item.layer.items;
      const i = list.indexOf(item);
      if (i >= 0) list.splice(i, 1);
    }
    for (const [host, L] of this.layers) {
      if (L.gen !== gen && L.items.length === 0 && host !== dev) {
        L.canvas.remove();
        this.layers.delete(host);
      } else {
        this.sizeLayer(L);
      }
    }
    this.place();
    this.draw();
  }

  private infoOf(el: HTMLElement): Info | null {
    const cls = el.className + '|' + (el.getAttribute('aria-pressed') ?? '');
    const cached = this.infos.get(el);
    if (cached && cached.cls === cls) return cached.info;
    const info = this.classify(el, cls);
    this.infos.set(el, { cls, info });
    return info;
  }

  private classify(el: HTMLElement, cls: string): Info | null {
    const c = el.classList;
    const cs = getComputedStyle(el);
    const bg = (): [number, number, number] => parseColor(cs.backgroundColor) ?? PUTTY;
    const rawRad = cs.borderTopLeftRadius;
    const mk = (h: number, rings: Ring[], wall: [number, number, number], glass = false): Info => ({
      cls,
      h,
      rings,
      wall,
      glass,
      rad: parseFloat(rawRad) || 0,
      radPct: rawRad.includes('%'),
    });
    if (c.contains('nk-pad')) {
      const edge = parseColor(cs.getPropertyValue('--nk-key-edge')) ?? PUTTY;
      const playing = c.contains('nk-pad--playing-own') || c.contains('nk-pad--playing-other');
      const h = c.contains('nk-pad--xl') ? 15 : c.contains('nk-pad--wide') ? 13 : 12;
      if (c.contains('nk-pad--disabled')) return mk(h * 0.7, SEAT, edge);
      return mk(h, playing ? NONE : c.contains('nk-pad--selected') ? SELECTED : SEAT, edge);
    }
    if (c.contains('nk-key')) {
      if (c.contains('nk-key--ghost')) return null;
      const down = c.contains('nk-key--on') || c.contains('nk-key--pressed');
      if (c.contains('nk-key--round')) return mk(15, COLLAR, [140, 35, 28]);
      if (c.contains('nk-key--danger')) return mk(9, PLAIN, [138, 31, 25]);
      if (c.contains('nk-key--accent')) return mk(7, PLAIN, [205, 185, 136]);
      const h = c.contains('nk-key--sm') ? 5 : c.contains('nk-key--lg') ? 8 : 7;
      return mk(down ? 2.5 : h, WELL, bg());
    }
    if (c.contains('nk-select')) return mk(6, WELL, bg());
    if (c.contains('nk-tag')) {
      const on = c.contains('nk-tag--selected') || el.getAttribute('aria-pressed') === 'true';
      return mk(on ? 2.5 : 5, WELL, bg());
    }
    if (c.contains('nk-tabs__tab')) {
      return mk(c.contains('nk-tabs__tab--on') ? 2 : 4.5, WELL, bg());
    }
    if (c.contains('nk-quickkey')) {
      return c.contains('nk-quickkey--empty') ? null : mk(5, WELL, bg());
    }
    // versenkt
    const dark: [number, number, number] = [16, 14, 11];
    if (c.contains('nk-lcd')) return mk(-7, NONE, dark, true);
    if (c.contains('nk-counter')) return mk(-3.5, NONE, dark, true);
    if (c.contains('nk-logo')) return mk(-2.5, NONE, dark, true);
    if (c.contains('nk-input')) return mk(-4, NONE, dark);
    if (c.contains('nk-switch')) return mk(-3, NONE, dark);
    if (c.contains('nk-channel')) return mk(-3.5, NONE, dark);
    if (c.contains('nk-rail')) return mk(-3, NONE, [30, 27, 22]);
    if (c.contains('nk-plate')) return mk(-5, NONE, [30, 27, 22]);
    if (c.contains('nk-printer')) return mk(-5, NONE, [30, 27, 22]);
    return null;
  }

  private layerFor(host: HTMLElement, dr: DOMRect, rectOf: (el: HTMLElement) => DOMRect): Layer {
    let L = this.layers.get(host);
    const scroller = host !== this.device;
    if (!L) {
      const canvas = document.createElement('canvas');
      canvas.className = 'nb-relief-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      Object.assign(canvas.style, {
        position: 'absolute',
        left: '0',
        top: '0',
        width: '0px',
        height: '0px',
        zIndex: scroller ? '40' : '55',
        pointerEvents: 'none',
        borderRadius: scroller ? '0' : 'inherit',
      } as Partial<CSSStyleDeclaration>);
      host.appendChild(canvas);
      const shadow = document.createElement('canvas');
      L = {
        host,
        scroller,
        canvas,
        ctx: canvas.getContext('2d')!,
        shadow,
        sctx: shadow.getContext('2d')!,
        q: 1,
        hx: 0,
        hy: 0,
        scrollX: 0,
        scrollY: 0,
        winY: 0,
        winW: 1,
        winH: 1,
        viewH: 1,
        contentH: 1,
        margin: 0,
        items: [],
        gen: 0,
      };
      this.layers.set(host, L);
    }
    if (L.gen !== this.gen) {
      L.gen = this.gen;
      if (scroller) {
        const sr = rectOf(host);
        L.hx = sr.left - dr.left + host.clientLeft;
        L.hy = sr.top - dr.top + host.clientTop;
        L.scrollX = host.scrollLeft;
        L.scrollY = host.scrollTop;
        L.viewH = host.clientHeight;
        L.winW = host.clientWidth;
        L.contentH = host.scrollHeight;
      } else {
        L.winW = dr.width;
        L.viewH = L.contentH = dr.height;
      }
    }
    return L;
  }

  private sizeLayer(L: Layer): void {
    if (L.scroller) {
      L.margin = clamp(L.viewH * 0.8, 240, 520);
      L.winH = Math.min(L.contentH, L.viewH + 2 * L.margin);
    } else {
      L.margin = 0;
      L.winH = L.contentH;
    }
    // Auflösung begrenzen (max. ~4,5 MP je Ebene)
    const q = Math.min(this.dpr, Math.sqrt(4.5e6 / Math.max(1, L.winW * L.winH)));
    const pw = Math.max(2, Math.round(L.winW * q));
    const ph = Math.max(2, Math.round(L.winH * q));
    L.q = q;
    if (L.canvas.width !== pw || L.canvas.height !== ph) {
      L.canvas.width = pw;
      L.canvas.height = ph;
      L.shadow.width = Math.max(2, Math.ceil(pw / SHADOW_DIV));
      L.shadow.height = Math.max(2, Math.ceil(ph / SHADOW_DIV));
    }
    L.canvas.style.width = `${L.winW}px`;
    L.canvas.style.height = `${L.winH}px`;
    this.anchor(L, true);
  }

  /** Canvas-Fenster eines Scrollers um den sichtbaren Bereich legen. true = verschoben */
  private anchor(L: Layer, force: boolean): boolean {
    if (!L.scroller) {
      L.winY = 0;
      return false;
    }
    const want = clamp(L.scrollY - L.margin, 0, Math.max(0, L.contentH - L.winH));
    const slack = L.margin * 0.5;
    const ok =
      !force &&
      L.scrollY >= L.winY + Math.min(slack, L.scrollY) &&
      L.scrollY + L.viewH <= L.winY + L.winH - Math.min(slack, L.contentH - L.scrollY - L.viewH);
    if (ok) return false;
    L.winY = want;
    L.canvas.style.top = `${want}px`;
    return true;
  }

  // ------------------------------------------------------------------ Ansicht

  /** Kamera/Licht/Höhe setzen, Oberseiten verschieben und zeichnen. */
  setView(v: ReliefView): void {
    if (this.disposed) return;
    this.view = v;
    this.place();
    this.draw();
  }

  /** Scroll-Ereignis eines Containers im Gerät. */
  onScroll(target: EventTarget | null): void {
    if (this.disposed || !(target instanceof HTMLElement)) return;
    const L = this.layers.get(target);
    if (!L) {
      // nicht verankerter Scroller (z. B. Tag-Schiene): Elemente liegen in der Geräteebene
      for (const it of this.items.values()) {
        if (it.clip && target.contains(it.el)) {
          this.refresh();
          return;
        }
      }
      return;
    }
    L.scrollX = target.scrollLeft;
    L.scrollY = target.scrollTop;
    if (this.anchor(L, false)) {
      this.place(L);
      this.drawLayer(L);
    }
  }

  /** Nach dem Scrollen: Parallaxe an die neue Lage anpassen. */
  settle(): void {
    if (this.disposed) return;
    this.place();
    this.draw();
  }

  /**
   * Taste/Pad unter dem Zeiger eindrücken bzw. loslassen. (px, py) = Zeiger in Gerätekoordinaten:
   * Die Oberseite sinkt nur so weit, dass der Zeiger sicher auf ihr bleibt – sonst landete das
   * Loslassen bei einem Druck nahe der Kante neben der Taste und der Klick ginge verloren.
   */
  press(target: EventTarget | null, down: boolean, px?: number, py?: number): void {
    if (down) {
      const el = target instanceof Element ? target.closest<HTMLElement>(RAISED_SEL) : null;
      const it = el ? this.items.get(el) : undefined;
      if (it && it.info.h > 0) {
        let min = PRESS_DOWN;
        if (px !== undefined && py !== undefined && it.moved && it.press > 0.05) {
          const L = it.layer;
          const bx = L.hx + it.x - L.scrollX;
          const by = L.hy + it.y - L.scrollY;
          // Verschiebung der voll herausstehenden Oberseite
          const fx = it.ox / it.press;
          const fy = it.oy / it.press;
          const m = 2;
          if (fx > 0.01) min = Math.max(min, (px - bx - it.w + m) / fx);
          else if (fx < -0.01) min = Math.max(min, (px - bx - m) / fx);
          if (fy > 0.01) min = Math.max(min, (py - by - it.h + m) / fy);
          else if (fy < -0.01) min = Math.max(min, (py - by - m) / fy);
        }
        it.pressTarget = Math.min(1, min);
        this.animating = true;
      }
    } else {
      for (const it of this.items.values()) {
        if (it.pressTarget !== 1) {
          it.pressTarget = 1;
          this.animating = true;
        }
      }
    }
  }

  /** Druckanimation fortschreiben. true = läuft noch (bitte weiter Bilder anfordern) */
  tick(dt: number, instant = false): boolean {
    if (!this.animating || this.disposed) return false;
    let busy = false;
    const touched = new Set<Layer>();
    for (const it of this.items.values()) {
      if (it.press === it.pressTarget) continue;
      const speed = it.pressTarget < it.press ? 16 : 9;
      const step = instant ? 1 : Math.min(1, dt * speed);
      it.press += (it.pressTarget - it.press) * step;
      if (Math.abs(it.press - it.pressTarget) < 0.02) it.press = it.pressTarget;
      else busy = true;
      touched.add(it.layer);
    }
    for (const L of touched) {
      this.place(L);
      this.drawLayer(L);
    }
    this.animating = busy;
    return busy;
  }

  /** aktuelle Verschiebung der Oberseite eines Elements (für Licht-Overlays des Intros) */
  offsetOf(el: HTMLElement): { ox: number; oy: number } | undefined {
    const it = this.items.get(el);
    return it && it.moved ? it : undefined;
  }

  private setActive(on: boolean): void {
    if (this.active === on) return;
    this.active = on;
    document.documentElement.classList.toggle(ROOT_CLASS, on);
  }

  /** Parallaxe berechnen und die Oberseiten im DOM verschieben. */
  private place(only?: Layer): void {
    const v = this.view;
    const active = v.k > 0.002 && v.cn > 60;
    this.setActive(active);
    for (const L of only ? [only] : this.layers.values()) {
      for (const it of L.items) {
        const raised = it.info.h > 0;
        let ox = 0;
        let oy = 0;
        let sx = 0;
        let sy = 0;
        const h = it.info.h * this.scale * v.k * (raised ? it.press : 1);
        if (active && Math.abs(h) > 0.04 && v.cn > Math.abs(h) * 3) {
          const cx = L.hx + it.x + it.w / 2 - L.scrollX;
          const cy = L.hy + it.y + it.h / 2 - L.scrollY;
          const f = h / (v.cn - h);
          ox = (cx - v.cu) * f;
          oy = (cy - v.cv) * f;
          const len = Math.hypot(ox, oy);
          const max = Math.abs(h) * 3;
          if (len > max) {
            ox *= max / len;
            oy *= max / len;
          }
          if (raised && v.ln > h * 2) {
            const g = h / (v.ln - h);
            sx = (cx - v.lu) * g;
            sy = (cy - v.lv) * g;
            const sl = Math.hypot(sx, sy);
            const smax = h * 2.2;
            if (sl > smax) {
              sx *= smax / sl;
              sy *= smax / sl;
            }
          }
        }
        it.hh = active ? h : 0;
        it.sx = sx;
        it.sy = sy;
        if (!raised) {
          it.ox = ox;
          it.oy = oy;
          continue;
        }
        if (active !== it.marked) {
          it.marked = active;
          if (active) it.el.setAttribute(ATTR, '');
          else it.el.removeAttribute(ATTR);
        }
        const zero = Math.abs(ox) < 0.05 && Math.abs(oy) < 0.05;
        if (zero) {
          if (it.moved) {
            it.el.style.transform = '';
            it.moved = false;
          }
          it.ox = 0;
          it.oy = 0;
        } else if (!it.moved || Math.abs(ox - it.ox) > 0.1 || Math.abs(oy - it.oy) > 0.1) {
          it.ox = ox;
          it.oy = oy;
          it.moved = true;
          it.el.style.transform = `translate(${ox.toFixed(2)}px,${oy.toFixed(2)}px)`;
        }
      }
    }
  }

  private release(it: Item): void {
    if (it.moved) {
      it.el.style.transform = '';
      it.moved = false;
    }
    if (it.marked) {
      it.el.removeAttribute(ATTR);
      it.marked = false;
    }
  }

  // ------------------------------------------------------------------ Zeichnen

  private draw(): void {
    for (const L of this.layers.values()) this.drawLayer(L);
  }

  private drawLayer(L: Layer): void {
    const ctx = L.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, L.canvas.width, L.canvas.height);
    if (!this.active || !L.items.length) return;
    ctx.setTransform(L.q, 0, 0, L.q, 0, -L.winY * L.q);
    const y0 = L.winY - 60;
    const y1 = L.winY + L.winH + 60;
    const free: Item[] = [];
    const clipped = new Map<string, Item[]>();
    for (const it of L.items) {
      if (it.y + it.h < y0 || it.y > y1) continue;
      if (!it.clip) {
        free.push(it);
        continue;
      }
      const key = `${it.clip.x}|${it.clip.y}|${it.clip.w}|${it.clip.h}`;
      const list = clipped.get(key);
      if (list) list.push(it);
      else clipped.set(key, [it]);
    }
    this.passes(L, free);
    for (const list of clipped.values()) {
      const c = list[0].clip!;
      ctx.save();
      ctx.beginPath();
      ctx.rect(c.x, c.y, c.w, c.h);
      ctx.clip();
      this.passes(L, list);
      ctx.restore();
    }
    if (!L.scroller) this.sheen(ctx);
  }

  /**
   * Weicher Reflex der Lampe auf der seidenmatten Oberfläche: liegt am Spiegelpunkt der Lampe und
   * wandert mit dem Blickwinkel über das Gerät.
   */
  private sheen(ctx: CanvasRenderingContext2D): void {
    const v = this.view;
    const a = 0.085 * v.sheen * Math.min(1, v.k * 1.5);
    if (a < 0.004 || v.cn <= 0 || v.ln <= 0) return;
    const t = v.cn / (v.cn + v.ln);
    const px = v.cu + (v.lu - v.cu) * t;
    const py = v.cv + (v.lv - v.cv) * t;
    const rad = Math.max(this.W, this.H) * 0.5;
    if (px < -rad || py < -rad || px > this.W + rad || py > this.H + rad) return;
    const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, `rgba(255,232,196,${a.toFixed(4)})`);
    g.addColorStop(0.35, `rgba(255,232,196,${(a * 0.45).toFixed(4)})`);
    g.addColorStop(1, 'rgba(255,232,196,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.W, this.H);
  }

  private passes(L: Layer, items: Item[]): void {
    if (!items.length) return;
    const ctx = L.ctx;
    const v = this.view;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // 1) Versenkungen: sichtbare Innenwand an der kamerafernen Seite
    for (const it of items) {
      if (it.info.h >= 0) continue;
      if (Math.abs(it.ox) < 0.3 && Math.abs(it.oy) < 0.3) continue;
      this.recess(ctx, it);
    }

    // 2) Schächte/Ringe an der Grundfläche (deckungsgleich mit den ausgeblendeten Box-Shadows)
    for (const it of items) {
      if (it.info.h <= 0) continue;
      const rings = it.info.rings;
      for (let i = rings.length - 1; i >= 0; i--) {
        const g = rings[i];
        ctx.fillStyle = g.c;
        ctx.beginPath();
        ctx.roundRect(
          it.x - g.s + g.dx,
          it.y - g.s + g.dy,
          it.w + 2 * g.s,
          it.h + 2 * g.s,
          it.r > 0 ? it.r + g.s : 0,
        );
        ctx.fill();
      }
    }

    // 3) Schlagschatten der Lampe auf der Platte
    const sc = L.sctx;
    const sq = L.q / SHADOW_DIV;
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.clearRect(0, 0, L.shadow.width, L.shadow.height);
    sc.setTransform(sq, 0, 0, sq, 0, -L.winY * sq);
    sc.fillStyle = '#000';
    sc.lineJoin = 'round';
    sc.lineCap = 'round';
    let anyShadow = false;
    for (const it of items) {
      if (it.hh <= 0.6) continue;
      if (Math.abs(it.sx) < 0.4 && Math.abs(it.sy) < 0.4) continue;
      this.sweep(sc, it.x - 1, it.y - 1, it.w + 2, it.h + 2, it.r + 1, it.sx, it.sy);
      sc.fill();
      anyShadow = true;
    }
    if (anyShadow) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 0.42;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(L.shadow, 0, 0, L.shadow.width * SHADOW_DIV, L.shadow.height * SHADOW_DIV);
      ctx.restore();
    }

    // 4) Flanken
    for (const it of items) {
      if (it.hh <= 0 || !it.moved) continue;
      this.walls(ctx, it, v);
    }

    // 5) Oberseiten ausstanzen (das echte DOM-Element scheint durch)
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    for (const it of items) {
      if (it.info.h <= 0) continue;
      ctx.beginPath();
      ctx.roundRect(
        it.x + it.ox - RIM,
        it.y + it.oy - RIM,
        it.w + 2 * RIM,
        it.h + 2 * RIM,
        it.r > 0 ? it.r + RIM : 0,
      );
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /**
   * Pfad der Fläche, die ein abgerundetes Rechteck beim Verschieben um (ox, oy) überstreicht.
   * Füllt die Rundung über die Strichbreite (Minkowski-Summe aus Innenrechteck-Hülle und Kreis).
   */
  private sweep(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    ox: number,
    oy: number,
  ): void {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    const x0 = x + rr;
    const y0 = y + rr;
    const x1 = x + w - rr;
    const y1 = y + h - rr;
    const sx = ox >= 0;
    const sy = oy >= 0;
    // Ecken: a = entgegen der Verschiebung, c = in Richtung der Verschiebung
    const ax = sx ? x0 : x1;
    const ay = sy ? y0 : y1;
    const cx = sx ? x1 : x0;
    const cy = sy ? y1 : y0;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(cx, ay);
    ctx.lineTo(cx + ox, ay + oy);
    ctx.lineTo(cx + ox, cy + oy);
    ctx.lineTo(ax + ox, cy + oy);
    ctx.lineTo(ax, cy);
    ctx.closePath();
    if (rr > 0.25) {
      ctx.lineWidth = rr * 2;
      // Strich und Füllung in derselben Farbe
      const fs = ctx.fillStyle;
      ctx.strokeStyle = fs;
      ctx.stroke();
    }
  }

  private walls(ctx: CanvasRenderingContext2D, it: Item, v: ReliefView): void {
    const x = it.x - RIM;
    const y = it.y - RIM;
    const w = it.w + 2 * RIM;
    const h = it.h + 2 * RIM;
    const r = it.r > 0 ? it.r + RIM : 0;
    const { ox, oy } = it;
    const [cr, cg, cb] = it.info.wall;
    // Licht: Richtung zur Lampe in der Ebene, Anteil der seitlichen Beleuchtung
    const L = this.layerOrigin(it);
    const lx = v.lu - L.cx;
    const ly = v.lv - L.cy;
    const ld = Math.hypot(lx, ly, v.ln) || 1;
    const shade = (nx: number, ny: number): number =>
      0.44 + 0.56 * clamp((nx * lx + ny * ly) / ld, 0, 1) * 1.3;
    const col = (s: number): string =>
      `rgb(${Math.round(cr * s)},${Math.round(cg * s)},${Math.round(cb * s)})`;

    // Grundkörper der Flanke (Ecken), mittlere Helligkeit
    const base = shade(-Math.sign(ox) * 0.7, -Math.sign(oy) * 0.7) * 0.62;
    ctx.fillStyle = col(base);
    this.sweep(ctx, x, y, w, h, r, ox, oy);
    ctx.fill();

    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    // vordere bzw. hintere Flanke
    if (Math.abs(oy) > 0.3) {
      const yb = oy < 0 ? y + h : y;
      const s = shade(0, oy < 0 ? 1 : -1);
      const g = ctx.createLinearGradient(0, yb + oy, 0, yb);
      g.addColorStop(0, col(s * 0.95));
      g.addColorStop(0.25, col(s * 0.78));
      g.addColorStop(1, col(s * 0.42));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x + rr, yb);
      ctx.lineTo(x + w - rr, yb);
      ctx.lineTo(x + w - rr + ox, yb + oy);
      ctx.lineTo(x + rr + ox, yb + oy);
      ctx.closePath();
      ctx.fill();
    }
    // seitliche Flanke
    if (Math.abs(ox) > 0.3) {
      const xb = ox < 0 ? x + w : x;
      const s = shade(ox < 0 ? 1 : -1, 0);
      const g = ctx.createLinearGradient(xb + ox, 0, xb, 0);
      g.addColorStop(0, col(s * 0.95));
      g.addColorStop(0.25, col(s * 0.78));
      g.addColorStop(1, col(s * 0.42));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(xb, y + rr);
      ctx.lineTo(xb, y + h - rr);
      ctx.lineTo(xb + ox, y + h - rr + oy);
      ctx.lineTo(xb + ox, y + rr + oy);
      ctx.closePath();
      ctx.fill();
    }
  }

  private layerOrigin(it: Item): { cx: number; cy: number } {
    const L = it.layer;
    return {
      cx: L.hx + it.x + it.w / 2 - L.scrollX,
      cy: L.hy + it.y + it.h / 2 - L.scrollY,
    };
  }

  /** Innenwand einer Versenkung: Streifen zwischen Rand und (zur Kamera hin verschobenem) Boden. */
  private recess(ctx: CanvasRenderingContext2D, it: Item): void {
    const { x, y, w, h, r, ox, oy } = it;
    const [cr, cg, cb] = it.info.wall;
    const hi = `rgb(${cr + 30},${cg + 27},${cb + 22})`;
    const lo = `rgb(${Math.round(cr * 0.45)},${Math.round(cg * 0.45)},${Math.round(cb * 0.45)})`;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.clip();
    if (Math.abs(oy) > 0.3) {
      // Boden rutscht nach unten (Kamera vorne) → obere Innenwand sichtbar, sonst die untere
      const yb = oy > 0 ? y : y + h;
      const g = ctx.createLinearGradient(0, yb, 0, yb + oy);
      g.addColorStop(0, hi);
      g.addColorStop(1, lo);
      ctx.fillStyle = g;
      ctx.fillRect(x, Math.min(yb, yb + oy), w, Math.abs(oy));
      const s = ctx.createLinearGradient(0, yb + oy, 0, yb + oy * 2.4);
      s.addColorStop(0, 'rgba(0,0,0,0.34)');
      s.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = s;
      ctx.fillRect(x, Math.min(yb + oy, yb + oy * 2.4), w, Math.abs(oy) * 1.4);
    }
    if (Math.abs(ox) > 0.3) {
      const xb = ox > 0 ? x : x + w;
      const g = ctx.createLinearGradient(xb, 0, xb + ox, 0);
      g.addColorStop(0, hi);
      g.addColorStop(1, lo);
      ctx.fillStyle = g;
      ctx.fillRect(Math.min(xb, xb + ox), y, Math.abs(ox), h);
      const s = ctx.createLinearGradient(xb + ox, 0, xb + ox * 2.4, 0);
      s.addColorStop(0, 'rgba(0,0,0,0.3)');
      s.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = s;
      ctx.fillRect(Math.min(xb + ox, xb + ox * 2.4), y, Math.abs(ox) * 1.4, h);
    }
    // Glas: Reflex der Lampe wandert mit dem Blickwinkel
    if (it.info.glass) this.glare(ctx, it);
    ctx.restore();
  }

  private glare(ctx: CanvasRenderingContext2D, it: Item): void {
    const v = this.view;
    const { cx, cy } = this.layerOrigin(it);
    // Spiegelbild der Lampe auf der Ebene, vom Element aus gesehen → Lage des Reflexbands
    const t = v.cn / (v.cn + v.ln);
    const px = v.cu + (v.lu - v.cu) * t;
    const py = v.cv + (v.lv - v.cv) * t;
    const span = Math.max(260, this.W * 0.42);
    const d = ((cx - px) * 0.82 + (cy - py) * 0.57) / span;
    const pos = 0.5 + d;
    if (pos < -0.4 || pos > 1.4) return;
    const a = 0.2 * v.k * clamp(1.4 - Math.abs(pos - 0.5) * 2, 0, 1);
    if (a < 0.01) return;
    const len = it.w + it.h;
    const bx = it.x + (pos - 0.5) * len * 1.2;
    const g = ctx.createLinearGradient(bx, it.y, bx + it.h * 0.9 + it.w * 0.35, it.y + it.h);
    g.addColorStop(0, 'rgba(255,240,212,0)');
    g.addColorStop(0.42, `rgba(255,240,212,${a.toFixed(3)})`);
    g.addColorStop(0.58, `rgba(255,240,212,${(a * 0.75).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,240,212,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.fillRect(it.x, it.y, it.w, it.h);
    ctx.globalCompositeOperation = 'source-over';
  }

  // ------------------------------------------------------------------ Ende

  /** Relief abschalten: alle Oberseiten zurück, Canvases leer. */
  flatten(): void {
    this.view = { ...this.view, k: 0 };
    this.place();
    this.draw();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mo.disconnect();
    this.ro.disconnect();
    for (const it of this.items.values()) this.release(it);
    this.items.clear();
    for (const L of this.layers.values()) L.canvas.remove();
    this.layers.clear();
    document.documentElement.classList.remove(ROOT_CLASS);
  }
}
