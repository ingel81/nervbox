import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../core/services/api.service';

interface TtsVoice {
  id: string;
  speakers: string[];
}

interface TtsResult {
  id: string;
  url: string;
  synthMs: number;
  durationMs: number;
  playedOnBox: boolean;
}

/** Labels for the voices / emotions shipped in pi-setup/tts */
const VOICE_LABELS: Record<string, string> = {
  'thorsten-high': 'Thorsten (hoch, langsam)',
  'thorsten-medium': 'Thorsten (mittel, schnell)',
  'thorsten_emotional-medium': 'Thorsten mit Gefühl',
  'kerstin-low': 'Kerstin',
  'eva_k-x_low': 'Eva',
};
const SPEAKER_LABELS: Record<string, string> = {
  neutral: 'neutral',
  amused: 'amüsiert',
  angry: 'wütend',
  disgusted: 'angewidert',
  drunk: 'betrunken',
  sleepy: 'müde',
  surprised: 'überrascht',
  whisper: 'flüsternd',
};
const MAX_CHARS = 500;

/**
 * Admin test for the Piper TTS service: text in, the Nervbox speaks it.
 */
@Component({
  selector: 'app-tts-test-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatIconModule],
  template: `
    <div class="nk-dlg tts">
      <header class="nk-dialog__head">
        <mat-icon class="tts-ico" aria-hidden="true">record_voice_over</mat-icon>
        <h2 class="nk-dialog__title">Sprachausgabe (Test)</h2>
        <button
          type="button"
          class="nk-key nk-key--sm nk-key--icon"
          aria-label="Schließen"
          (click)="dialogRef.close()"
        >
          ✕
        </button>
      </header>
      <div class="nk-dialog__body tts-body">
        @if (error()) {
          <p class="tts-msg tts-msg--err">{{ error() }}</p>
        }
        <label class="nk-field">
          <span class="nk-label">Text ({{ text().length }}/{{ maxChars }})</span>
          <span class="nk-input tts-area">
            <textarea
              class="nk-input__field"
              rows="4"
              [maxLength]="maxChars"
              [ngModel]="text()"
              (ngModelChange)="text.set($event)"
              (keydown.control.enter)="speak()"
              placeholder="Was soll die Nervbox sagen?"
              aria-label="Text"
            ></textarea>
          </span>
        </label>
        <div class="tts-row">
          <label class="nk-field">
            <span class="nk-label">Stimme</span>
            <span class="nk-input">
              <select
                class="nk-input__field"
                [ngModel]="voice()"
                (ngModelChange)="voice.set($event); speaker.set('')"
                aria-label="Stimme"
              >
                @for (v of voices(); track v.id) {
                  <option [value]="v.id">{{ label(v.id) }}</option>
                }
              </select>
            </span>
          </label>
          @if (speakers().length) {
            <label class="nk-field">
              <span class="nk-label">Gefühl</span>
              <span class="nk-input">
                <select
                  class="nk-input__field"
                  [ngModel]="speaker()"
                  (ngModelChange)="speaker.set($event)"
                  aria-label="Gefühl"
                >
                  <option value="">neutral</option>
                  @for (s of speakers(); track s) {
                    @if (s !== 'neutral') {
                      <option [value]="s">{{ speakerLabel(s) }}</option>
                    }
                  }
                </select>
              </span>
            </label>
          }
          <label class="nk-field">
            <span class="nk-label">Tempo</span>
            <span class="nk-input">
              <select
                class="nk-input__field"
                [ngModel]="lengthScale()"
                (ngModelChange)="lengthScale.set(+$event)"
                aria-label="Tempo"
              >
                <option [value]="0.8">schnell</option>
                <option [value]="1">normal</option>
                <option [value]="1.3">langsam</option>
              </select>
            </span>
          </label>
        </div>
        @if (busy()) {
          <p class="tts-msg">
            <span class="nk-spin" aria-hidden="true"></span> Thorsten räuspert sich … (ca.
            {{ estimate() }} s)
          </p>
        } @else if (result(); as r) {
          <p class="tts-msg">
            {{ (r.durationMs / 1000).toFixed(1) }} s Audio, erzeugt in
            {{ (r.synthMs / 1000).toFixed(1) }} s ·
            {{
              r.playedOnBox
                ? 'läuft auf der Nervbox'
                : 'Box spielt nicht lokal – im Browser angehört'
            }}
          </p>
        }
      </div>
      <footer class="nk-dialog__foot">
        @if (result(); as r) {
          <button type="button" class="nk-key nk-key--ghost" (click)="listenHere(r)">
            Hier anhören
          </button>
        }
        <button
          type="button"
          class="nk-key nk-key--accent"
          [disabled]="busy() || !text().trim()"
          (click)="speak()"
        >
          Sprechen
        </button>
      </footer>
    </div>
  `,
  styles: [
    `
      .tts {
        width: min(560px, 92vw);
      }
      .tts-ico {
        color: var(--nk-lamp, #6ef0a0);
      }
      .tts-body {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .tts-area {
        height: auto;
        align-items: stretch;
        padding: 8px 10px;
      }
      .tts-area textarea {
        resize: vertical;
        min-height: 92px;
        line-height: 1.35;
      }
      .tts-row {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }
      .tts-row .nk-field {
        flex: 1 1 140px;
      }
      .tts-msg {
        margin: 0;
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--nk-iv-2);
        font-size: 13px;
      }
      .tts-msg--err {
        color: #ff8a80;
      }
    `,
  ],
})
export class TtsTestDialogComponent implements OnInit {
  readonly dialogRef = inject(MatDialogRef<TtsTestDialogComponent>);
  private readonly api = inject(ApiService);

  readonly maxChars = MAX_CHARS;
  readonly voices = signal<TtsVoice[]>([]);
  readonly voice = signal('thorsten-high');
  readonly speaker = signal('');
  readonly lengthScale = signal(1);
  readonly text = signal(
    'Achtung, Achtung! Die Nervbox-Zentralbank gibt bekannt: Der Holzpreis steigt.',
  );
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly result = signal<TtsResult | null>(null);

  readonly speakers = computed(
    () => this.voices().find((v) => v.id === this.voice())?.speakers ?? [],
  );

  /** Rough wait time: ~14 chars per second of audio, thorsten-high renders at ~2x real time on the Pi 4 */
  readonly estimate = computed(() => {
    const audioS = Math.max(1, this.text().length / 14) * this.lengthScale();
    const rtf = this.voice() === 'thorsten-high' ? 2 : 0.35;
    return Math.max(1, Math.round(audioS * rtf));
  });

  ngOnInit(): void {
    this.api.get<TtsVoice[]>('/tts/voices').subscribe({
      next: (v) => {
        this.voices.set(v);
        if (!v.some((x) => x.id === this.voice()) && v.length) this.voice.set(v[0].id);
      },
      error: (e) => this.error.set(e?.error?.error ?? 'TTS-Dienst nicht erreichbar'),
    });
  }

  label(id: string): string {
    return VOICE_LABELS[id] ?? id;
  }

  speakerLabel(s: string): string {
    return SPEAKER_LABELS[s] ?? s;
  }

  speak(): void {
    const text = this.text().trim();
    if (!text || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.api
      .post<TtsResult>('/tts', {
        text,
        voice: this.voice(),
        speaker: this.speaker() || null,
        lengthScale: this.lengthScale(),
      })
      .subscribe({
        next: (r) => {
          this.result.set(r);
          this.busy.set(false);
          if (!r.playedOnBox) this.listenHere(r);
        },
        error: (e) => {
          this.error.set(e?.error?.error ?? 'Sprachausgabe fehlgeschlagen');
          this.busy.set(false);
        },
      });
  }

  listenHere(r: TtsResult): void {
    const audio = new Audio(this.api.getFullUrl(r.url));
    audio.play().catch(() => this.error.set('Browser hat die Wiedergabe blockiert'));
  }
}
