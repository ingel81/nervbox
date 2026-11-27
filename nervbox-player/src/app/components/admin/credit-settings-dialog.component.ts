import { Component, inject, OnInit, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { CreditService, CreditSettings } from '../../core/services/credit.service';

@Component({
  selector: 'app-credit-settings-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDividerModule,
  ],
  template: `
    <div class="nk-dlg cs">
      <header class="nk-dialog__head">
        <mat-icon class="cs-ico" aria-hidden="true">savings</mat-icon>
        <h2 class="nk-dialog__title">Shekel-Einstellungen</h2>
        <button
          type="button"
          class="nk-key nk-key--sm nk-key--icon"
          aria-label="Schließen"
          (click)="dialogRef.close()"
        >
          ✕
        </button>
      </header>
      @if (loading()) {
        <div class="nk-dialog__body">
          <div class="cs-state"><span class="nk-spin" aria-hidden="true"></span>lädt …</div>
        </div>
      } @else if (settings(); as s) {
        <div class="nk-dialog__body cs-body">
          <div class="nk-section">
            <h3 class="nk-section__title">Start-N$</h3>
            <div class="cs-grid">
              <label class="nk-field"
                ><span class="nk-label">N$ für neue User</span
                ><span class="nk-input"
                  ><input
                    class="nk-input__field cs-num"
                    type="number"
                    min="0"
                    [(ngModel)]="s.initialCreditsUser"
                    aria-label="N$ für neue User"
                  /><span class="cs-unit">N$</span></span
                ><span class="nk-field__hint">Initiale N$ bei Registrierung</span></label
              >
              <label class="nk-field"
                ><span class="nk-label">N$ für Admins</span
                ><span class="nk-input"
                  ><input
                    class="nk-input__field cs-num"
                    type="number"
                    min="0"
                    [(ngModel)]="s.initialCreditsAdmin"
                    aria-label="N$ für Admins"
                  /><span class="cs-unit">N$</span></span
                ><span class="nk-field__hint">Admins haben quasi unbegrenzte N$</span></label
              >
            </div>
          </div>
          <div class="nk-section">
            <h3 class="nk-section__title">Sound-Abspielen</h3>
            <div class="cs-grid">
              <label class="nk-field"
                ><span class="nk-label">Kosten pro Sound</span
                ><span class="nk-input"
                  ><input
                    class="nk-input__field cs-num"
                    type="number"
                    min="0"
                    [(ngModel)]="s.costPerSoundPlay"
                    aria-label="Kosten pro Sound"
                  /><span class="cs-unit">N$</span></span
                ><span class="nk-field__hint">N$ die pro Abspielen abgezogen werden</span></label
              >
              <label class="nk-field"
                ><span class="nk-label">Min. N$ zum Spielen</span
                ><span class="nk-input"
                  ><input
                    class="nk-input__field cs-num"
                    type="number"
                    min="0"
                    [(ngModel)]="s.minCreditsToPlay"
                    aria-label="Min. N$ zum Spielen"
                  /><span class="cs-unit">N$</span></span
                ><span class="nk-field__hint">Mindestguthaben um abspielen zu können</span></label
              >
            </div>
          </div>
          <div class="nk-section">
            <h3 class="nk-section__title">Stündliche Bonus-N$</h3>
            <span class="cs-switch">
              <button
                type="button"
                role="switch"
                [attr.aria-checked]="s.hourlyCreditsEnabled"
                [class]="s.hourlyCreditsEnabled ? 'nk-switch nk-switch--on' : 'nk-switch'"
                aria-label="Stündliche N$ aktiviert"
                (click)="s.hourlyCreditsEnabled = !s.hourlyCreditsEnabled"
              >
                <span class="nk-switch__knob" aria-hidden="true"></span>
              </button>
              Stündliche N$ aktiviert
            </span>
            @if (s.hourlyCreditsEnabled) {
              <div class="cs-grid">
                <label class="nk-field"
                  ><span class="nk-label">N$ pro Stunde</span
                  ><span class="nk-input"
                    ><input
                      class="nk-input__field cs-num"
                      type="number"
                      min="1"
                      [(ngModel)]="s.hourlyCreditsAmount"
                      aria-label="N$ pro Stunde"
                    /><span class="cs-unit">N$</span></span
                  ><span class="nk-field__hint">Automatische Gutschrift jede Stunde</span></label
                >
              </div>
            }
          </div>
          <div class="nk-section">
            <h3 class="nk-section__title">Limits</h3>
            <div class="cs-grid">
              <label class="nk-field"
                ><span class="nk-label">Maximale N$ (User)</span
                ><span class="nk-input"
                  ><input
                    class="nk-input__field cs-num"
                    type="number"
                    min="1"
                    [(ngModel)]="s.maxCreditsUser"
                    aria-label="Maximale N$ (User)"
                  /><span class="cs-unit">N$</span></span
                ><span class="nk-field__hint">Obergrenze für normale User</span></label
              >
            </div>
          </div>
        </div>
        <footer class="nk-dialog__foot">
          <button type="button" class="nk-key nk-key--ghost" (click)="dialogRef.close()">
            Abbrechen
          </button>
          <button
            type="button"
            class="nk-key nk-key--accent"
            (click)="save()"
            [disabled]="saving()"
          >
            @if (saving()) {
              <span class="nk-spin" aria-hidden="true"></span>
            }
            Speichern
          </button>
        </footer>
      }
    </div>
  `,
  styles: `
    .cs {
      width: 540px;
      max-width: 100%;
      max-height: 90vh;
    }
    .cs-ico {
      color: var(--nk-iv);
      filter: drop-shadow(0 0 4px rgb(255 226 176 / 0.6));
    }
    .cs-body {
      gap: 16px;
      overflow-y: auto;
    }
    .cs-state {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 18px 8px;
      color: var(--nk-iv-2);
      font: 500 13px var(--nk-font-mono);
    }
    .cs-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px 16px;
    }
    .cs-num {
      text-align: right;
      font: 400 26px/1 var(--nk-font-lcd);
      letter-spacing: 1px;
    }
    .cs-unit {
      font: 600 11px var(--nk-font-mono);
      color: var(--nk-iv-2);
    }
    .cs-switch {
      display: flex;
      align-items: center;
      gap: 12px;
      font: 600 15px var(--nk-font-ui);
      padding: 2px 0;
    }
    @media (max-width: 520px) {
      .cs-grid {
        grid-template-columns: 1fr;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class CreditSettingsDialogComponent implements OnInit {
  readonly dialogRef = inject(MatDialogRef<CreditSettingsDialogComponent>);
  private readonly creditService = inject(CreditService);
  private readonly snackBar = inject(MatSnackBar);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly settings = signal<CreditSettings | null>(null);

  ngOnInit(): void {
    this.loadSettings();
  }

  private loadSettings(): void {
    this.loading.set(true);
    this.creditService.getSettings().subscribe({
      next: (settings) => {
        this.settings.set(settings);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load credit settings:', err);
        this.snackBar.open('Fehler beim Laden der Einstellungen', 'OK', { duration: 3000 });
        this.loading.set(false);
        this.dialogRef.close();
      },
    });
  }

  save(): void {
    const currentSettings = this.settings();
    if (!currentSettings) return;

    this.saving.set(true);
    this.creditService.updateSettings(currentSettings).subscribe({
      next: () => {
        this.snackBar.open('Einstellungen gespeichert', 'OK', { duration: 2000 });
        this.saving.set(false);
        this.dialogRef.close(true);
      },
      error: (err) => {
        console.error('Failed to save credit settings:', err);
        this.snackBar.open('Fehler beim Speichern', 'OK', { duration: 3000 });
        this.saving.set(false);
      },
    });
  }
}
