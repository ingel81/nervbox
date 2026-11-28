import { Injectable, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { AudioEngineService } from './audio-engine.service';
import { ConfigService } from './config.service';
import { SignalRService } from './signalr.service';
import { LiveParams, SoundEffectId, liveFromDrag } from '../audio/sound-fx';

/** Anzeige des Live-HUD am Zeiger */
export interface LiveHudState {
  /** Druckpunkt (Viewport-px) */
  x: number;
  y: number;
  /** aktueller Zeiger relativ zum Druckpunkt (px) */
  dx: number;
  dy: number;
  params: LiveParams;
  name: string;
  /** Stimme bekannt (Play-Antwort da) */
  bound: boolean;
  /** Stimme schon zu Ende */
  ended: boolean;
  /** Geste losgelassen → HUD blendet aus */
  released: boolean;
}

/** Laufende Halten-und-Ziehen-Geste auf einem Pad */
export interface LiveGesture {
  move(x: number, y: number, t: number): void;
  end(): void;
  readonly active: () => boolean;
}

const SEND_INTERVAL_MS = 50; // ~20 Updates/s an den Hub
const BIND_TIMEOUT_MS = 5000;
/** Totzone, bevor aus einem Klick eine Live-Geste wird */
const DEADZONE_PX = 6;

/**
 * Steuerung einzelner Stimmen: Ein-Klick-Effekt „scharf schalten“, Stopp, Live-Steuerung.
 * Browser-Modus → direkt auf die Web-Audio-Knoten; Pi-Modus → gedrosselt über den Sound-Hub.
 *
 * Loslassen: Tempo/Filter BLEIBEN stehen (man „stellt“ den Sound ein – z. B. Monster-Stimme ziehen
 * und loslassen); nur das Wobble klingt aus, weil es vom Schütteln lebt.
 */
@Injectable({ providedIn: 'root' })
export class VoiceControlService {
  private readonly api = inject(ApiService);
  private readonly engine = inject(AudioEngineService);
  private readonly config = inject(ConfigService);
  private readonly signalR = inject(SignalRService);

  private armed: { hash: string; effect: SoundEffectId; at: number } | null = null;
  private readonly waiters: { hash: string; at: number; bind: (id: number) => void }[] = [];
  private readonly endedIds = new Set<number>();
  private readonly endedListeners: ((id: number) => void)[] = [];
  /** eigene Stimmen dieses Tabs: id → Hash */
  private readonly own = new Map<number, string>();

  readonly hud = signal<LiveHudState | null>(null);

  /**
   * Touch-Live-Geste aktiv: Scrollen unterdrücken. Ein einziger nicht-passiver touchmove-Listener
   * am Dokument (muss schon beim touchstart existieren, sonst darf er nicht mehr abbrechen).
   */
  blockTouchScroll = false;

  constructor() {
    document.addEventListener(
      'touchmove',
      (e) => {
        if (this.blockTouchScroll && e.cancelable) e.preventDefault();
      },
      { passive: false },
    );
    this.signalR.soundEnded$.subscribe((ev) => {
      this.markEnded(ev.voiceId);
      // Browser-Modus: Admin/anderer Tab hat gestoppt → hier hörbare Stimme anhalten
      if (ev.reason === 'stopped' && this.engine.has(ev.voiceId)) this.engine.stop(ev.voiceId);
    });
    this.engine.onEnded((id, reason) => {
      this.markEnded(id);
      // natürliches Ende an alle melden (Kanalanzeige der anderen)
      if (id > 0 && reason !== 'stopped') this.signalR.reportVoiceEnded(id);
    });
  }

  // ------------------------------------------------------------ Effekte

  /** Pad-Menü „Mit Effekt abspielen“: der nächste Play-Aufruf dieses Sounds bekommt den Effekt. */
  armEffect(hash: string, effect: SoundEffectId): void {
    this.armed = { hash, effect, at: Date.now() };
  }

  takeArmedEffect(hash: string): SoundEffectId | null {
    const a = this.armed;
    this.armed = null;
    return a && a.hash === hash && Date.now() - a.at < 3000 ? a.effect : null;
  }

  // ------------------------------------------------------------ Stimmen

  /** SoundService meldet die Stimmen-ID eines eigenen Play-Aufrufs. */
  registerOwnPlay(hash: string, voiceId: number): void {
    this.own.set(voiceId, hash);
    if (this.own.size > 64) this.own.delete(this.own.keys().next().value!);
    const now = Date.now();
    const i = this.waiters.findIndex((w) => w.hash === hash && now - w.at < BIND_TIMEOUT_MS);
    if (i >= 0) this.waiters.splice(i, 1)[0].bind(voiceId);
  }

  isEnded(voiceId: number): boolean {
    return this.endedIds.has(voiceId);
  }

  onVoiceEnded(cb: (id: number) => void): void {
    this.endedListeners.push(cb);
  }

  private markEnded(id: number): void {
    if (this.endedIds.has(id)) return;
    this.endedIds.add(id);
    if (this.endedIds.size > 300) this.endedIds.delete(this.endedIds.values().next().value!);
    for (const cb of this.endedListeners) cb(id);
  }

  /** Eine Stimme stoppen (eigene oder als Admin). */
  stopVoice(voiceId: number): Observable<unknown> {
    if (this.engine.has(voiceId)) this.engine.stop(voiceId);
    return this.api.post(`/voice/${voiceId}/stop`);
  }

  /** Live-Parameter anwenden (Browser direkt, Pi gedrosselt über den Hub) */
  private readonly sendState = new Map<
    number,
    { last: number; timer: ReturnType<typeof setTimeout> | null; params: LiveParams }
  >();

  modulate(voiceId: number, params: LiveParams): void {
    if (this.config.isBrowserPlayback() || voiceId < 0) {
      this.engine.setLive(voiceId, params);
      return;
    }
    let st = this.sendState.get(voiceId);
    if (!st) {
      st = { last: 0, timer: null, params };
      this.sendState.set(voiceId, st);
    }
    st.params = params;
    const now = Date.now();
    const flush = (): void => {
      const s = this.sendState.get(voiceId);
      if (!s) return;
      s.timer = null;
      s.last = Date.now();
      this.signalR.modulateVoice(voiceId, s.params.rate, s.params.filter, s.params.wobble);
    };
    if (now - st.last >= SEND_INTERVAL_MS) flush();
    else if (!st.timer) st.timer = setTimeout(flush, SEND_INTERVAL_MS - (now - st.last));
    if (this.sendState.size > 32) this.sendState.delete(this.sendState.keys().next().value!);
  }

  // ------------------------------------------------------------ Live-Geste

  /**
   * Beginnt mit dem Druck auf ein Pad (der Sound startet wie gewohnt). Die Stimme wird an die
   * nächste eigene Play-Antwort dieses Sounds gebunden. Bewegung jenseits der Totzone steuert sie.
   */
  beginGesture(hash: string, name: string, x: number, y: number): LiveGesture {
    let voiceId: number | null = null;
    let live = false;
    let released = false;
    let last: LiveParams | null = null;
    // geglättete Position (Schütteln → Wobble, nicht Tempo-Zittern)
    let sx = 0;
    let sy = 0;
    let lastT = performance.now();
    let lastRawX = x;
    let lastRawY = y;
    let lastVx = 0;
    let lastVy = 0;
    let shake = 0;
    let decayTimer: ReturnType<typeof setInterval> | null = null;

    const waiter = {
      hash,
      at: Date.now(),
      bind: (id: number) => {
        voiceId = id;
        if (last) this.modulate(id, last);
        this.patchHud({ bound: true, ended: this.endedIds.has(id) });
      },
    };
    this.waiters.push(waiter);
    while (this.waiters.length > 8) this.waiters.shift();

    const endedCb = (id: number): void => {
      if (id === voiceId) this.patchHud({ ended: true });
    };
    this.onVoiceEnded(endedCb);
    const detach = (): void => {
      const i = this.endedListeners.indexOf(endedCb);
      if (i >= 0) this.endedListeners.splice(i, 1);
      // nur ein Klick ohne Ziehen: nichts mehr zu binden. Gezogen, aber Antwort noch unterwegs:
      // Warter bleibt, damit die eingestellten Werte beim Binden noch ankommen.
      const w = this.waiters.indexOf(waiter);
      if (w >= 0 && !live) this.waiters.splice(w, 1);
    };

    const push = (): void => {
      const params = liveFromDrag(sx, sy, shake);
      last = params;
      if (voiceId !== null && !this.endedIds.has(voiceId)) this.modulate(voiceId, params);
      this.patchHud({ dx: lastRawX - x, dy: lastRawY - y, params });
    };

    const gesture: LiveGesture = {
      active: () => live && !released,
      move: (mx: number, my: number, t: number) => {
        if (released) return;
        const dx = mx - x;
        const dy = my - y;
        if (!live) {
          if (Math.hypot(dx, dy) < DEADZONE_PX) return;
          live = true;
          sx = dx;
          sy = dy;
          this.hud.set({
            x,
            y,
            dx,
            dy,
            params: liveFromDrag(dx, dy, 0),
            name,
            bound: voiceId !== null,
            ended: voiceId !== null && this.endedIds.has(voiceId),
            released: false,
          });
        }
        const dt = Math.max(1, t - lastT);
        lastT = t;
        const vx = (mx - lastRawX) / dt;
        const vy = (my - lastRawY) / dt;
        lastRawX = mx;
        lastRawY = my;
        // Schütteln: schnelle Richtungswechsel laden das Wobble auf, es klingt mit ~0,45 s ab
        shake *= Math.exp(-dt / 450);
        const flipX = Math.sign(vx) !== Math.sign(lastVx) && Math.abs(vx) > 0.5;
        const flipY = Math.sign(vy) !== Math.sign(lastVy) && Math.abs(vy) > 0.5;
        if (flipX || flipY) shake = Math.min(1, shake + 0.22);
        if (Math.abs(vx) > 0.05) lastVx = vx;
        if (Math.abs(vy) > 0.05) lastVy = vy;
        const a = 1 - Math.exp(-dt / 120);
        sx += (dx - sx) * a;
        sy += (dy - sy) * a;
        push();
        if (!decayTimer) {
          // auch ohne Bewegung weiter rechnen (Wobble abklingen, Glättung nachziehen)
          decayTimer = setInterval(() => {
            const now = performance.now();
            const ddt = Math.max(1, now - lastT);
            if (ddt < 40) return;
            lastT = now;
            shake *= Math.exp(-ddt / 450);
            if (shake < 0.01) shake = 0;
            const b = 1 - Math.exp(-ddt / 120);
            sx += (lastRawX - x - sx) * b;
            sy += (lastRawY - y - sy) * b;
            push();
            if (released && shake === 0) {
              clearInterval(decayTimer!);
              decayTimer = null;
            }
          }, 50);
        }
      },
      end: () => {
        if (released) return;
        released = true;
        detach();
        if (!live) return;
        // Tempo/Filter bleiben, Wobble klingt über den Timer aus
        this.patchHud({ released: true });
        setTimeout(() => {
          const h = this.hud();
          if (h?.released) this.hud.set(null);
        }, 700);
      },
    };
    return gesture;
  }

  private patchHud(p: Partial<LiveHudState>): void {
    const h = this.hud();
    if (h) this.hud.set({ ...h, ...p });
  }
}
