import { Component, computed, inject, input, output, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { Sound } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { CreditService } from '../../core/services/credit.service';
import { ConfigService } from '../../core/services/config.service';
import { FavoritesService } from '../../core/services/favorites.service';
import { AchievementService } from '../../core/services/achievement.service';
import { ApiService } from '../../core/services/api.service';
import { VoteService } from '../../core/services/vote.service';
import { PadPlayState } from '../../core/services/now-playing.service';
import { UserAvatarComponent } from '../shared/user-avatar/user-avatar.component';
import { tagToneStyle } from '../../shared/tag-tone';
import { LoudnessService } from '../../core/services/loudness.service';
import { HOTKEY_DIGITS, HotkeyService } from '../../core/services/hotkey.service';
import { SoundService } from '../../core/services/sound.service';
import { LiveGesture, VoiceControlService } from '../../core/services/voice-control.service';
import { SOUND_EFFECTS, SoundEffectId } from '../../core/audio/sound-fx';

export type PadVariant = 'normal' | 'wide' | 'xl';

/** Uploads jünger als 7 Tage bekommen das NEU-Etikett */
const NEW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Sound-Pad im Nachtschicht-Look (.nk-pad aus dem Nacht-Kit).
 * Klick = abspielen (bzw. auswählen im Auswahlmodus). Alle Funktionen der alten Kachel:
 * Autor-Avatar, Favorit, Name (Tooltip), Dauer, Plays, Tag-Chips (+N), Votes, ⋮-Menü,
 * deaktiviert, Auswahlmodus. Neu: Laufend-Zustand (eigener/fremder Sound), NEU-Etikett,
 * Kopfhörer-Schnellzugriff bei Hover.
 */
@Component({
  selector: 'app-sound-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatTooltipModule, MatMenuModule, MatDividerModule, UserAvatarComponent],
  template: `
    <div
      role="button"
      tabindex="0"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-disabled]="!sound().enabled"
      [class]="padClass()"
      [style]="padStyle()"
      (pointerdown)="onPointerDown($event)"
      (contextmenu)="onContextMenu($event)"
      (click)="onPadClick($event)"
      (keydown.enter)="onPadKey($event)"
      (keydown.space)="onPadKey($event)"
    >
      <div class="nk-pad__top">
        <span class="nk-pad__check" aria-hidden="true">✓</span>
        <div
          class="nk-pad__text"
          [matTooltip]="padTooltip()"
          matTooltipClass="nk-tip-multiline"
          matTooltipShowDelay="600"
        >
          @if (rank()) {
            <span class="nk-pad__rank">#{{ rank() }} · MEISTGESPIELT</span>
          }
          <span class="nk-pad__name">{{ sound().name }}</span>
          <span class="nk-pad__meta">{{ meta() }}</span>
        </div>
        <div class="nk-pad__votes">
          <button
            type="button"
            [class]="isUpvoted() ? 'nk-pad__vote nk-pad__vote--on' : 'nk-pad__vote'"
            [attr.aria-pressed]="isUpvoted()"
            [attr.aria-label]="isUpvoted() ? 'Upvote entfernen' : 'Upvote'"
            [matTooltip]="
              auth.isLoggedIn()
                ? isUpvoted()
                  ? 'Upvote entfernen'
                  : 'Upvote'
                : 'Einloggen zum Voten'
            "
            (click)="onUpvote($event)"
          >
            ▲
          </button>
          <span class="nk-pad__score">{{ scoreText() }}</span>
          <button
            type="button"
            [class]="isDownvoted() ? 'nk-pad__vote nk-pad__vote--on' : 'nk-pad__vote'"
            [attr.aria-pressed]="isDownvoted()"
            [attr.aria-label]="isDownvoted() ? 'Downvote entfernen' : 'Downvote'"
            [matTooltip]="
              auth.isLoggedIn()
                ? isDownvoted()
                  ? 'Downvote entfernen'
                  : 'Downvote'
                : 'Einloggen zum Voten'
            "
            (click)="onDownvote($event)"
          >
            ▼
          </button>
        </div>
      </div>

      <div class="nk-pad__foot">
        @if (auth.isLoggedIn()) {
          <button
            type="button"
            [class]="isFavorite() ? 'nk-pad__heart nk-pad__heart--on' : 'nk-pad__heart'"
            [attr.aria-label]="isFavorite() ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'"
            [matTooltip]="isFavorite() ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'"
            (click)="toggleFavorite($event)"
          >
            {{ isFavorite() ? '♥' : '♡' }}
          </button>
          @if (hotkey(); as key) {
            <span class="nk-keycap" [matTooltip]="'Taste ' + key + ' spielt diesen Sound'">{{
              key
            }}</span>
          }
        }
        <span class="nk-pad__tags">
          @for (tag of displayedTags(); track tag) {
            <span class="nk-chip">#{{ tag }}</span>
          }
          @if (hiddenTagCount() > 0) {
            <span class="nk-chip nk-chip--more" [matTooltip]="hiddenTags()"
              >+{{ hiddenTagCount() }}</span
            >
          }
        </span>
        <span class="nk-pad__new">NEU</span>
        <span class="nk-pad__spacer"></span>
        @if (players().length) {
          @for (p of players(); track $index) {
            <span
              class="nk-avatar nk-avatar--xs nk-pad__player"
              [matTooltip]="p.name + ' spielt gerade'"
              >{{ initials(p.name) }}</span
            >
          }
          @if (players().length > 1) {
            <span class="nk-pad__multi">×{{ players().length }}</span>
          }
        } @else if (sound().authorId) {
          <app-user-avatar class="nk-pad__author-av" [userId]="sound().authorId" size="xs" />
        }
      </div>

      <span class="nk-pad__tape">DEAKTIVIERT</span>
      <span class="nk-pad__actions">
        <button
          type="button"
          class="nk-pad__listen"
          aria-label="Im Browser anhören"
          matTooltip="Im Browser anhören"
          (click)="$event.stopPropagation(); playInBrowser()"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            aria-hidden="true"
          >
            <path d="M4 14v-2a8 8 0 0116 0v2M4 14h3v6H4zM17 14h3v6h-3z"></path>
          </svg>
        </button>
        <button
          type="button"
          class="nk-pad__more"
          aria-label="Mehr Aktionen"
          aria-haspopup="menu"
          [matMenuTriggerFor]="menu"
          (click)="$event.stopPropagation()"
        >
          ⋮
        </button>
      </span>
      <span class="nk-pad__progress" aria-hidden="true">
        <span class="nk-pad__progress-fill" [style.width.%]="playState()?.progress ?? 0"></span>
      </span>
    </div>

    <mat-menu #menu="matMenu">
      @if (!configService.isBrowserPlayback()) {
        <button mat-menu-item (click)="playClick.emit(sound())">
          <mat-icon>speaker</mat-icon>
          <span>Auf Nervbox abspielen</span>
        </button>
      }
      <button mat-menu-item [matMenuTriggerFor]="fxMenu" [disabled]="!sound().enabled">
        <mat-icon>auto_fix_high</mat-icon>
        <span>Mit Effekt abspielen</span>
      </button>
      <button mat-menu-item (click)="playInBrowser()">
        <mat-icon>headphones</mat-icon>
        <span>Im Browser anhören</span>
      </button>
      <button mat-menu-item (click)="openInMixer()">
        <mat-icon>tune</mat-icon>
        <span>Im Mixer öffnen</span>
      </button>
      @if (auth.isLoggedIn()) {
        <button mat-menu-item [matMenuTriggerFor]="keyMenu">
          <mat-icon>keyboard</mat-icon>
          <span>Auf Taste legen</span>
        </button>
        @if (hotkey(); as key) {
          <button mat-menu-item (click)="releaseHotkey()">
            <mat-icon>keyboard_hide</mat-icon>
            <span>Taste {{ key }} freigeben</span>
          </button>
        }
      }
      @if (isAdmin()) {
        <mat-divider></mat-divider>
        <button mat-menu-item (click)="editClick.emit(sound())">
          <mat-icon>edit</mat-icon>
          <span>Bearbeiten</span>
        </button>
        <button mat-menu-item (click)="toggleClick.emit(sound())">
          <mat-icon>{{ sound().enabled ? 'visibility_off' : 'visibility' }}</mat-icon>
          <span>{{ sound().enabled ? 'Deaktivieren' : 'Aktivieren' }}</span>
        </button>
        <button mat-menu-item class="nk-menu-danger" (click)="deleteClick.emit(sound())">
          <mat-icon>delete_forever</mat-icon>
          <span>Löschen</span>
        </button>
      }
    </mat-menu>

    <mat-menu #fxMenu="matMenu" class="fx-menu">
      @for (fx of effects; track fx.id) {
        <button mat-menu-item (click)="playWithEffect(fx.id)">
          <mat-icon>{{ fx.icon }}</mat-icon>
          <span class="fx-menu__row">
            <span>{{ fx.label }}</span>
            <span class="fx-menu__hint">{{ fx.hint }}</span>
          </span>
        </button>
      }
    </mat-menu>

    <mat-menu #keyMenu="matMenu" class="hk-menu">
      @for (digit of digits; track digit) {
        <button
          mat-menu-item
          [class.hk-menu__item--current]="hotkey() === digit"
          (click)="assignHotkey(digit)"
        >
          <span class="hk-menu__row">
            <span class="nk-keycap" [class.nk-keycap--light]="hotkey() === digit">{{ digit }}</span>
            <span class="hk-menu__name">{{ slotLabel(digit) }}</span>
          </span>
        </button>
      }
    </mat-menu>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
      height: 100%;
    }
    :host > div {
      height: 100%;
      /* Halten + Ziehen = Live-Steuerung: kein Markieren, kein iOS-Kontextmenü */
      -webkit-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
    }
    .fx-menu__row {
      display: inline-flex;
      align-items: baseline;
      gap: 10px;
    }
    .fx-menu__hint {
      font-size: 12px;
      opacity: 0.6;
    }
    .nk-pad__author-av {
      flex-shrink: 0;
      border-radius: 50%;
      box-shadow: 0 0 0 1px rgb(255 255 255 / 0.55);
      --avatar-size: 17px;
    }
    .hk-menu__row {
      display: flex;
      align-items: center;
      gap: 9px;
      min-width: 0;
    }
    .hk-menu__name {
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      opacity: 0.7;
    }
    .hk-menu__item--current .hk-menu__name {
      opacity: 1;
      text-shadow: var(--nk-glow-key);
    }
  `,
})
export class SoundCardComponent {
  readonly auth = inject(AuthService);
  private readonly creditService = inject(CreditService);
  readonly configService = inject(ConfigService);
  private readonly favoritesService = inject(FavoritesService);
  private readonly achievementService = inject(AchievementService);
  private readonly api = inject(ApiService);
  private readonly voteService = inject(VoteService);
  private readonly loudness = inject(LoudnessService);
  private readonly hotkeys = inject(HotkeyService);
  private readonly soundService = inject(SoundService);
  private readonly voiceControl = inject(VoiceControlService);

  readonly digits = HOTKEY_DIGITS;
  readonly effects = SOUND_EFFECTS;

  readonly sound = input.required<Sound>();
  readonly tagColors = input<Record<string, string>>({});
  readonly selectionMode = input<boolean>(false);
  readonly isSelected = input<boolean>(false);
  readonly playState = input<PadPlayState | undefined>(undefined);
  readonly variant = input<PadVariant>('normal');
  readonly rank = input<number | null>(null);
  /** Lampenanteil 0…1 (nah an der Schreibtischlampe oben links = heller) */
  readonly lampF = input<number>(0.5);

  readonly playClick = output<Sound>();
  readonly editClick = output<Sound>();
  readonly toggleClick = output<Sound>();
  readonly deleteClick = output<Sound>();
  readonly selectionToggle = output<Sound>();

  /** Hotkey digit 1–9 this sound is on (logged-in users only) */
  readonly hotkey = computed(() =>
    this.auth.isLoggedIn() ? this.hotkeys.digitFor(this.sound().hash) : undefined,
  );

  readonly isAdmin = computed(() => this.auth.currentUser()?.role === 'admin');
  private readonly maxChips = computed(() => (this.variant() === 'normal' ? 1 : 3));
  readonly displayedTags = computed(() => this.sound().tags?.slice(0, this.maxChips()) ?? []);
  readonly hiddenTagCount = computed(() =>
    Math.max(0, (this.sound().tags?.length ?? 0) - this.maxChips()),
  );
  readonly hiddenTags = computed(
    () =>
      this.sound()
        .tags?.slice(this.maxChips())
        .map((t) => `#${t}`)
        .join(', ') ?? '',
  );

  readonly userVote = computed(() => this.voteService.getUserVote(this.sound().hash));
  readonly isUpvoted = computed(() => this.userVote() === 1);
  readonly isDownvoted = computed(() => this.userVote() === -1);
  readonly scoreText = computed(() => {
    const s = this.sound().score ?? 0;
    return s > 0 ? `+${s}` : s < 0 ? `−${Math.abs(s)}` : '0';
  });

  readonly players = computed(() => this.playState()?.players ?? []);

  readonly isNew = computed(() => {
    const t = new Date(this.sound().createdAt).getTime();
    return !isNaN(t) && Date.now() - t < NEW_MS;
  });

  /** ≥1000 kompakt mit deutschem Komma: 1234 → „1,2k“, 12000 → „12k“ */
  private formatPlays(n: number): string {
    if (n < 1000) return String(n);
    const k = Math.floor(n / 100) / 10;
    return (
      (k >= 100 || Number.isInteger(k) ? String(Math.round(k)) : k.toFixed(1).replace('.', ',')) +
      'k'
    );
  }

  /** Name + price (+ hint when the wallet is too low) */
  readonly padTooltip = computed(() => {
    const cost = this.creditService.costPerPlay();
    const lines = [
      this.sound().name,
      cost > 0 ? `Kostet ${cost.toLocaleString('de-DE')} N$ pro Abspielen` : 'Kostenlos',
    ];
    if (this.auth.isLoggedIn() && cost > 0 && this.creditService.credits() < cost) {
      lines.push('Zu wenig Schekel');
    }
    return lines.join('\n');
  });

  readonly meta = computed(() => {
    const s = this.sound();
    const dur = this.formatDuration(s.durationMs);
    const plays = s.playCount ? ` · ${this.formatPlays(s.playCount)}×` : '';
    const st = this.playState();
    if (st?.own) return `${dur} · läuft · du`;
    if (st?.other) {
      if (this.variant() === 'normal') return `${dur} · läuft`;
      return st.players.length > 1
        ? `${dur}${plays} · läuft ${st.players.length}×`
        : `${dur}${plays} · läuft · ${st.players[0].name}`;
    }
    return dur + plays;
  });

  readonly padClass = computed(() => {
    const st = this.playState();
    const c = ['nk-pad'];
    if (this.variant() === 'xl') c.push('nk-pad--xl');
    if (this.variant() === 'wide') c.push('nk-pad--wide');
    if (!this.sound().enabled) c.push('nk-pad--disabled');
    else if (st?.own) c.push('nk-pad--playing-own');
    else if (st?.other) c.push('nk-pad--playing-other');
    if (this.isNew()) c.push('nk-pad--new');
    if (this.selectionMode()) c.push('nk-pad--selectable');
    if (this.isSelected()) c.push('nk-pad--selected');
    if (!this.auth.isLoggedIn()) c.push('nk-pad--guest');
    return c.join(' ');
  });

  readonly padStyle = computed(() => {
    const tag = this.sound().tags?.[0];
    const color = tag ? this.tagColors()[tag] : undefined;
    const beat = 1.7 + (this.sound().hash.charCodeAt(0) % 4) * 0.25;
    // laufend/deaktiviert: Farbe kommt aus der Zustandsklasse, nicht aus dem Tag
    const st = this.playState();
    const tone = st || !this.sound().enabled ? '' : `${tagToneStyle(color)}; `;
    return `${tone}--nk-lamp-f: ${this.lampF().toFixed(2)}; --nk-beat: ${beat.toFixed(2)}s`;
  });

  readonly ariaLabel = computed(() => {
    const s = this.sound();
    if (this.selectionMode()) return `${s.name} ${this.isSelected() ? 'abwählen' : 'auswählen'}`;
    let label = `${s.name} abspielen`;
    if (!s.enabled) label += ' (deaktiviert)';
    const st = this.playState();
    if (st) label += `, läuft gerade (${st.players.map((p) => p.name).join(', ')})`;
    return label;
  });

  /** Enter/Leertaste nur auf dem Pad selbst – nicht wenn sie von Herz/Vote/⋮ hochblubbern */
  onPadKey(event: Event): void {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    this.handleClick();
  }

  /** Time of the last mouse press that triggered the pad; the click that follows it is ignored. */
  private firedOnPointerDownAt = 0;

  /** Touch: Zeitpunkt, an dem ein langer Druck den Sound gestartet hat (folgender Klick = ignorieren) */
  private firedOnLongPressAt = 0;
  /** Druck (Maus oder Finger) läuft gerade auf diesem Pad */
  private pressActive = false;

  /**
   * Mouse: trigger immediately on press (feels like a real pad). Touch/pen keep tap-on-release,
   * otherwise every scroll gesture over the grid would fire sounds – but a finger held still for
   * 300 ms starts the sound too and switches to live control (drag = modulate, no scrolling).
   * While the button/finger stays down, dragging modulates the started voice (VoiceControlService).
   */
  onPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const target = event.target as Element | null;
    if (target?.closest('button, a, [role="menuitem"], .avatar-container.clickable')) return;
    if (event.pointerType === 'mouse') {
      this.firedOnPointerDownAt = 0;
      this.handleClick();
      this.firedOnPointerDownAt = Date.now();
      if (this.canGoLive()) this.trackPress(event, true);
      return;
    }
    if (this.canGoLive()) this.trackPress(event, false);
  }

  /** Live-Steuerung nur für eingeloggte Nutzer auf aktiven Pads außerhalb des Auswahlmodus */
  private canGoLive(): boolean {
    return this.sound().enabled && !this.selectionMode() && this.auth.isLoggedIn();
  }

  /**
   * Verfolgt einen Druck über Fenster-Listener (die Karte kann während des Ziehens neu erzeugt
   * werden). started=false (Touch): erst nach 300 ms Stillhalten starten Sound und Live-Geste.
   */
  private trackPress(down: PointerEvent, started: boolean): void {
    const id = down.pointerId;
    const x0 = down.clientX;
    const y0 = down.clientY;
    const s = this.sound();
    let gesture: LiveGesture | null = started
      ? this.voiceControl.beginGesture(s.hash, s.name, x0, y0)
      : null;
    let longPress: ReturnType<typeof setTimeout> | null = null;
    let firedByLongPress = false;
    this.pressActive = true;

    const cleanup = (): void => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      if (longPress) clearTimeout(longPress);
      gesture?.end();
      gesture = null;
      this.voiceControl.blockTouchScroll = false;
      this.pressActive = false;
      // der Klick nach dem Loslassen darf den Sound nicht nochmal starten
      if (firedByLongPress) this.firedOnLongPressAt = Date.now();
    };
    const move = (e: PointerEvent): void => {
      if (e.pointerId !== id) return;
      if (!gesture) {
        // Touch vor Ablauf des langen Drucks bewegt → normales Scrollen, kein Live
        if (Math.hypot(e.clientX - x0, e.clientY - y0) > 10) cleanup();
        return;
      }
      gesture.move(e.clientX, e.clientY, e.timeStamp || performance.now());
      if (gesture.active()) e.preventDefault();
    };
    const up = (e: PointerEvent): void => {
      if (e.pointerId === id) cleanup();
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);

    if (!started) {
      longPress = setTimeout(() => {
        longPress = null;
        if (!this.canGoLive()) return cleanup();
        this.firedOnLongPressAt = Date.now();
        firedByLongPress = true;
        this.voiceControl.blockTouchScroll = true;
        this.handleClick();
        gesture = this.voiceControl.beginGesture(s.hash, s.name, x0, y0);
        navigator.vibrate?.(12);
      }, 300);
    }
  }

  /** Langer Druck per Finger öffnet sonst das Kontextmenü des Browsers */
  onContextMenu(event: Event): void {
    if (this.pressActive || Date.now() - this.firedOnLongPressAt < 500) event.preventDefault();
  }

  /** Pad-Menü „Mit Effekt abspielen“ */
  playWithEffect(effect: SoundEffectId): void {
    if (!this.sound().enabled) return;
    this.voiceControl.armEffect(this.sound().hash, effect);
    this.playClick.emit(this.sound());
  }

  /**
   * Mouse clicks are ignored: the mouse already fired on pointerdown. This must not depend on
   * component state, because the card can be re-created between press and release (e.g. when the
   * sound ends), which made the release play the sound a second time.
   */
  onPadClick(event: MouseEvent): void {
    const pointerType = (event as PointerEvent).pointerType;
    if (pointerType === 'mouse') return;
    // Finger lange gedrückt: Sound lief schon beim Ablauf des langen Drucks los
    if (this.firedOnLongPressAt && Date.now() - this.firedOnLongPressAt < 500) {
      this.firedOnLongPressAt = 0;
      return;
    }
    // Browsers without PointerEvent clicks: fall back to the time guard
    if (
      pointerType === undefined &&
      this.firedOnPointerDownAt &&
      Date.now() - this.firedOnPointerDownAt < 1500
    ) {
      this.firedOnPointerDownAt = 0;
      return;
    }
    this.handleClick();
  }

  handleClick(): void {
    if (!this.sound().enabled) return;
    if (this.selectionMode()) {
      this.selectionToggle.emit(this.sound());
    } else {
      this.playClick.emit(this.sound());
    }
  }

  initials(name: string): string {
    return (
      (name || '?')
        .replace(/[^A-Za-zÄÖÜäöü0-9]/g, '')
        .slice(0, 2)
        .toUpperCase() || '?'
    );
  }

  private formatDuration(ms: number): string {
    const total = Math.round((ms || 0) / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  /** Hotkey submenu label: the sound currently on that key */
  slotLabel(digit: number): string {
    const hash = this.hotkeys.hashFor(digit);
    if (!hash) return 'frei';
    if (hash === this.sound().hash) return 'dieser Sound';
    return this.soundService.sounds().find((s) => s.hash === hash)?.name ?? 'unbekannter Sound';
  }

  assignHotkey(digit: number): void {
    this.hotkeys.assign(this.sound().hash, digit);
  }

  releaseHotkey(): void {
    this.hotkeys.release(this.sound().hash);
  }

  openInMixer(): void {
    this.achievementService.markMixerVisited().subscribe();
    window.location.href = `/mixer?sounds=${this.sound().hash}`;
  }

  playInBrowser(): void {
    const url = this.api.getFullUrl(`/sound/${this.sound().hash}/file`);
    const audio = new Audio(url);
    audio.volume = 0.7 * this.loudness.gain(this.sound().hash);
    audio.play().catch((err) => console.warn('Browser audio playback failed:', err));
  }

  isFavorite(): boolean {
    return this.favoritesService.isFavorite(this.sound().hash);
  }

  toggleFavorite(event: Event): void {
    event.stopPropagation();
    this.favoritesService.toggleFavorite(this.sound().hash);
  }

  onUpvote(event: Event): void {
    event.stopPropagation();
    if (!this.auth.isLoggedIn()) return;
    this.voteService.toggleVote(this.sound().hash, 1).subscribe();
  }

  onDownvote(event: Event): void {
    event.stopPropagation();
    if (!this.auth.isLoggedIn()) return;
    this.voteService.toggleVote(this.sound().hash, -1).subscribe();
  }
}
