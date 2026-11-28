import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatSnackBar, MatSnackBarRef, TextOnlySnackBar } from '@angular/material/snack-bar';
import { SwUpdate } from '@angular/service-worker';

/** Wie oft im Hintergrund nach einer neuen Version gefragt wird. */
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Meldet neue Deploy-Versionen. Der Service Worker liefert beim Laden die
 * gecachte Version aus und laedt die neue nur im Hintergrund; ohne diesen
 * Dienst wuerde sie erst beim uebernaechsten Laden sichtbar. Statt ungefragt
 * neu zu laden (laufende Sounds/Spiele) gibt es einen Hinweis mit Knopf.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly sw = inject(SwUpdate);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  private ready = false;
  private broken = false;
  private ref: MatSnackBarRef<TextOnlySnackBar> | null = null;

  init(): void {
    if (!this.sw.isEnabled) return;

    this.sw.versionUpdates.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((evt) => {
      if (evt.type === 'VERSION_READY') {
        this.ready = true;
        this.prompt();
      }
    });

    // Cache kaputt / alte Version auf dem Server nicht mehr vorhanden:
    // ohne Neuladen schlagen nachgeladene Module (Spiele, Dialoge) fehl.
    this.sw.unrecoverable.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.broken = true;
      this.prompt();
    });

    const check = () => {
      if (this.ready || this.broken) {
        this.prompt();
        return;
      }
      this.sw.checkForUpdate().catch(() => undefined);
    };

    const timer = setInterval(check, CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    this.destroyRef.onDestroy(() => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }

  /** Zeigt den Hinweis (erneut), falls ihn eine andere Meldung verdraengt hat. */
  private prompt(): void {
    if (this.ref) return;
    const text = this.broken
      ? 'Die App muss neu geladen werden'
      : 'Neue Version der Nervbox verfügbar';
    this.ref = this.snackBar.open(text, 'Neu laden');
    this.ref.onAction().subscribe(() => this.reload());
    this.ref.afterDismissed().subscribe(() => (this.ref = null));
  }

  private async reload(): Promise<void> {
    if (this.ready && !this.broken) {
      await this.sw.activateUpdate().catch(() => undefined);
    }
    document.location.reload();
  }
}
