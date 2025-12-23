import { Component, inject, OnInit, signal } from '@angular/core';
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
    <div class="dialog-container">
      <div class="dialog-header">
        <img src="icons/nervbox-coin.svg" alt="Shekel" class="header-coin">
        <h2>Shekel-Einstellungen</h2>
      </div>

      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="40"></mat-spinner>
        </div>
      } @else if (settings()) {
        <div class="settings-content">
          <div class="settings-section">
            <h3>
              <img src="icons/nervbox-coin.svg" alt="" class="section-coin">
              Start-N$
            </h3>
            <mat-form-field appearance="outline">
              <mat-label>N$ für neue User</mat-label>
              <input matInput type="number" [(ngModel)]="settings()!.initialCreditsUser" min="0">
              <mat-hint>Initiale N$ bei Registrierung</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>N$ für Admins</mat-label>
              <input matInput type="number" [(ngModel)]="settings()!.initialCreditsAdmin" min="0">
              <mat-hint>Admins haben quasi unbegrenzte N$</mat-hint>
            </mat-form-field>
          </div>

          <mat-divider></mat-divider>

          <div class="settings-section">
            <h3>
              <mat-icon>play_circle</mat-icon>
              Sound-Abspielen
            </h3>
            <mat-form-field appearance="outline">
              <mat-label>Kosten pro Sound</mat-label>
              <input matInput type="number" [(ngModel)]="settings()!.costPerSoundPlay" min="0">
              <mat-hint>N$ die pro Abspielen abgezogen werden</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Min. N$ zum Spielen</mat-label>
              <input matInput type="number" [(ngModel)]="settings()!.minCreditsToPlay" min="0">
              <mat-hint>Mindestguthaben um abspielen zu können</mat-hint>
            </mat-form-field>
          </div>

          <mat-divider></mat-divider>

          <div class="settings-section">
            <h3>
              <mat-icon>schedule</mat-icon>
              Stündliche Bonus-N$
            </h3>
            <div class="toggle-row">
              <mat-slide-toggle [(ngModel)]="settings()!.hourlyCreditsEnabled">
                Stündliche N$ aktiviert
              </mat-slide-toggle>
            </div>
            @if (settings()!.hourlyCreditsEnabled) {
              <mat-form-field appearance="outline">
                <mat-label>N$ pro Stunde</mat-label>
                <input matInput type="number" [(ngModel)]="settings()!.hourlyCreditsAmount" min="1">
                <mat-hint>Automatische Gutschrift jede Stunde</mat-hint>
              </mat-form-field>
            }
          </div>

          <mat-divider></mat-divider>

          <div class="settings-section">
            <h3>
              <mat-icon>trending_up</mat-icon>
              Limits
            </h3>
            <mat-form-field appearance="outline">
              <mat-label>Maximale N$ (User)</mat-label>
              <input matInput type="number" [(ngModel)]="settings()!.maxCreditsUser" min="1">
              <mat-hint>Obergrenze für normale User</mat-hint>
            </mat-form-field>
          </div>
        </div>

        <div class="dialog-actions">
          <button mat-button (click)="dialogRef.close()">Abbrechen</button>
          <button mat-flat-button color="primary" (click)="save()" [disabled]="saving()">
            @if (saving()) {
              <mat-spinner diameter="20"></mat-spinner>
            } @else {
              <ng-container><mat-icon>save</mat-icon> Speichern</ng-container>
            }
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .dialog-container {
      min-width: 450px;
      max-width: 550px;
    }

    .dialog-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 24px;
      background: linear-gradient(135deg, rgba(234, 179, 8, 0.15) 0%, rgba(147, 51, 234, 0.1) 100%);
      border-bottom: 1px solid rgba(234, 179, 8, 0.3);
    }

    .header-coin {
      width: 40px;
      height: 40px;
      filter: drop-shadow(0 0 8px rgba(251, 191, 36, 0.6));
    }

    .section-coin {
      width: 18px;
      height: 18px;
    }

    .dialog-header h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: white;
    }

    .loading-container {
      display: flex;
      justify-content: center;
      padding: 48px;
    }

    .settings-content {
      padding: 16px 24px;
      max-height: 60vh;
      overflow-y: auto;
    }

    .settings-section {
      margin-bottom: 16px;
    }

    .settings-section h3 {
      display: flex;
      align-items: center;
      gap: 8px;
      color: rgba(255, 255, 255, 0.9);
      font-size: 14px;
      font-weight: 600;
      margin: 0 0 12px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .settings-section h3 mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: #9333ea;
    }

    .settings-section mat-form-field {
      width: 100%;
      margin-bottom: 8px;
    }

    .toggle-row {
      margin-bottom: 16px;
    }

    mat-divider {
      margin: 16px 0;
    }

    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding: 16px 24px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .dialog-actions button mat-icon {
      margin-right: 4px;
    }

    .dialog-actions mat-spinner {
      margin-right: 8px;
    }
  `],
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
