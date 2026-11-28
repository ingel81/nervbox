import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { VoiceControlService } from '../../core/services/voice-control.service';
import { LIVE_RANGE_PX, liveFilterHz } from '../../core/audio/sound-fx';

const PAD = 120; // XY-Feld in px
const HUD_W = 190;
const HUD_H = 196;

/**
 * Live-HUD am Zeiger: kleines hinterleuchtetes LCD mit XY-Feld (Fadenkreuz = Druckpunkt,
 * Punkt = Zeiger) und den Werten Tempo / Filter / Wobble der gerade gesteuerten Stimme.
 * Wird einmal in app.ts eingehängt und vom VoiceControlService gefüttert.
 */
@Component({
  selector: 'app-live-hud',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (view(); as v) {
      <div
        class="hud"
        [class.hud--out]="v.released"
        [style.left.px]="v.left"
        [style.top.px]="v.top"
        role="status"
        aria-live="polite"
        [attr.aria-label]="
          'Live-Steuerung ' + v.name + ': Tempo ' + v.rate + ', Filter ' + v.filter
        "
      >
        <div class="hud__glass">
          <div class="hud__head">
            <span class="hud__live" [class.hud__live--on]="v.bound && !v.ended">● LIVE</span>
            <span class="hud__name">{{ v.name }}</span>
          </div>
          <div class="hud__pad" aria-hidden="true">
            <span class="hud__axis hud__axis--x"></span>
            <span class="hud__axis hud__axis--y"></span>
            <span class="hud__tick hud__tick--hp">HP</span>
            <span class="hud__tick hud__tick--tp">TP</span>
            <span class="hud__tick hud__tick--slow">½×</span>
            <span class="hud__tick hud__tick--fast">2×</span>
            <span
              class="hud__dot"
              [class.hud__dot--wobble]="v.wobbling"
              [style.left.px]="v.dotX"
              [style.top.px]="v.dotY"
            ></span>
          </div>
          <div class="hud__vals">
            <span class="hud__k">TEMPO</span><span class="hud__v">{{ v.rate }}</span>
            <span class="hud__k">FILTER</span><span class="hud__v">{{ v.filter }}</span>
            <span class="hud__k">WOBBLE</span>
            <span class="hud__v hud__bars">
              @for (b of v.bars; track $index) {
                <span [class]="b ? 'hud__bar hud__bar--on' : 'hud__bar'"></span>
              }
            </span>
          </div>
          @if (!v.bound) {
            <span class="hud__state">WARTE AUF STIMME …</span>
          } @else if (v.ended) {
            <span class="hud__state">SOUND ZU ENDE</span>
          }
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 1200;
    }
    .hud {
      position: absolute;
      width: 190px;
      padding: 5px;
      border-radius: 9px;
      background: linear-gradient(160deg, #060505, #1d1b17);
      box-shadow:
        inset 2px 2px 4px rgb(0 0 0 / 0.95),
        0 10px 28px rgb(0 0 0 / 0.6),
        0 0 26px 4px rgb(var(--nk-lcd-glow-rgb) / 0.25);
      animation: hud-in 0.12s ease-out;
      transition: opacity 0.45s ease;
    }
    .hud--out {
      opacity: 0;
    }
    @keyframes hud-in {
      from {
        opacity: 0;
        transform: scale(0.94);
      }
    }
    .hud__glass {
      position: relative;
      border-radius: 4px;
      padding: 5px 7px 6px;
      color: var(--nk-lcd-ink);
      background: var(--nk-face-lcd);
      box-shadow:
        inset 0 0 12px rgb(46 62 14 / 0.45),
        inset 0 0 0 1px rgb(0 0 0 / 0.55);
      font-family: var(--nk-font-lcd);
    }
    .hud__head {
      display: flex;
      align-items: baseline;
      gap: 6px;
      min-width: 0;
      font-size: 15px;
      line-height: 1;
    }
    .hud__live {
      flex-shrink: 0;
      opacity: 0.35;
    }
    .hud__live--on {
      opacity: 1;
      animation: hud-blink 1s steps(2, start) infinite;
    }
    @keyframes hud-blink {
      to {
        opacity: 0.45;
      }
    }
    .hud__name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-transform: uppercase;
    }
    .hud__pad {
      position: relative;
      width: 120px;
      height: 120px;
      margin: 5px auto 4px;
      border-radius: 3px;
      box-shadow: inset 0 0 0 1.5px rgb(var(--nk-lcd-ink-rgb) / 0.75);
      background:
        repeating-linear-gradient(
          0deg,
          transparent 0 11px,
          rgb(var(--nk-lcd-ink-rgb) / 0.1) 11px 12px
        ),
        repeating-linear-gradient(
          90deg,
          transparent 0 11px,
          rgb(var(--nk-lcd-ink-rgb) / 0.1) 11px 12px
        );
    }
    .hud__axis {
      position: absolute;
      background: rgb(var(--nk-lcd-ink-rgb) / 0.55);
    }
    .hud__axis--x {
      left: 4px;
      right: 4px;
      top: 50%;
      height: 1px;
    }
    .hud__axis--y {
      top: 4px;
      bottom: 4px;
      left: 50%;
      width: 1px;
    }
    .hud__tick {
      position: absolute;
      font-size: 12px;
      line-height: 1;
      opacity: 0.8;
    }
    .hud__tick--hp {
      top: 3px;
      left: calc(50% + 4px);
    }
    .hud__tick--tp {
      bottom: 3px;
      left: calc(50% + 4px);
    }
    .hud__tick--slow {
      left: 3px;
      top: calc(50% + 3px);
    }
    .hud__tick--fast {
      right: 3px;
      top: calc(50% + 3px);
    }
    .hud__dot {
      position: absolute;
      width: 11px;
      height: 11px;
      margin: -5.5px 0 0 -5.5px;
      border-radius: 50%;
      background: var(--nk-lcd-ink);
      box-shadow: 0 0 0 2px rgb(var(--nk-lcd-bleed-rgb) / 0.6);
    }
    .hud__dot--wobble {
      animation: hud-wob 0.166s linear infinite alternate;
    }
    @keyframes hud-wob {
      to {
        transform: scale(1.45);
      }
    }
    .hud__vals {
      display: grid;
      grid-template-columns: auto 1fr;
      column-gap: 8px;
      font-size: 17px;
      line-height: 1;
    }
    .hud__k {
      opacity: 0.7;
    }
    .hud__v {
      text-align: right;
      white-space: nowrap;
    }
    .hud__bars {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 2px;
    }
    .hud__bar {
      width: 6px;
      height: 10px;
      border-radius: 1px;
      box-shadow: inset 0 0 0 1px rgb(var(--nk-lcd-ink-rgb) / 0.5);
    }
    .hud__bar--on {
      background: var(--nk-lcd-ink);
    }
    .hud__state {
      display: block;
      margin-top: 3px;
      font-size: 13px;
      text-align: center;
      opacity: 0.8;
    }
    @media (prefers-reduced-motion: reduce) {
      .hud,
      .hud__live--on,
      .hud__dot--wobble {
        animation: none;
      }
    }
  `,
})
export class LiveHudComponent {
  private readonly voiceControl = inject(VoiceControlService);

  readonly view = computed(() => {
    const h = this.voiceControl.hud();
    if (!h) return null;
    const half = PAD / 2;
    const clamp = (v: number): number => Math.max(-1, Math.min(1, v / LIVE_RANGE_PX));
    // Kasten oben rechts neben den Druckpunkt, innerhalb des Fensters
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = h.x + 28;
    if (left + HUD_W > vw - 8) left = h.x - 28 - HUD_W;
    let top = h.y - HUD_H - 20;
    if (top < 8) top = Math.min(vh - HUD_H - 8, h.y + 28);
    const p = h.params;
    const { lowpassHz, highpassHz } = liveFilterHz(p.filter);
    const filter =
      p.filter < -0.02
        ? `TP ${this.hz(lowpassHz)}`
        : p.filter > 0.02
          ? `HP ${this.hz(highpassHz)}`
          : 'OFFEN';
    return {
      left: Math.max(8, left),
      top,
      name: h.name,
      bound: h.bound,
      ended: h.ended,
      released: h.released,
      dotX: half + clamp(h.dx) * (half - 6),
      dotY: half + clamp(h.dy) * (half - 6),
      rate: `×${p.rate.toFixed(2).replace('.', ',')}`,
      filter,
      wobbling: p.wobble > 0.15,
      bars: Array.from({ length: 6 }, (_, i) => p.wobble > (i + 0.5) / 6),
    };
  });

  private hz(v: number): string {
    return v >= 1000 ? `${(v / 1000).toFixed(1).replace('.', ',')}k` : `${Math.round(v)}`;
  }
}
