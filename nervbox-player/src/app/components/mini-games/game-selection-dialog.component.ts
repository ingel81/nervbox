import { Component, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-game-selection-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="nk-dlg gs">
      <header class="nk-dialog__head gs-head">
        <mat-icon class="gs-ico" aria-hidden="true">sports_esports</mat-icon>
        <h2 class="nk-dialog__title gs-title">Mini Games</h2>
        <span class="nk-counter">EARN N$</span>
        <span class="gs-flex"></span>
        <span class="nk-label gs-hint">Modul einstecken = spielen</span>
        <button type="button" class="nk-key nk-key--sm nk-key--icon" aria-label="Schließen" mat-dialog-close>✕</button>
      </header>
      <div class="nk-dialog__body gs-body">
        @for (shelf of shelves; track shelf.label) {
          <div class="gs-shelf-wrap">
            <div class="gs-shelf">
              @for (c of shelf.carts; track c.title) {
                <button
                  type="button"
                  [class]="c.soon ? 'nk-cart nk-cart--soon' : c.isNew ? 'nk-cart nk-cart--new' : 'nk-cart'"
                  [style.--nk-cart-c]="c.color"
                  [attr.aria-label]="c.soon ? c.title + ' – bald verfügbar' : c.title + ' spielen'"
                  [disabled]="c.soon"
                  (click)="start(c.key)"
                >
                  <span class="nk-cart__grip" aria-hidden="true"></span>
                  <span class="nk-cart__label">
                    <span class="nk-cart__kind"><span>{{ c.kind }}</span><span [class]="c.soon ? 'nk-led nk-led--dot' : 'nk-led nk-led--dot nk-led--own'" aria-hidden="true"></span></span>
                    <span class="gs-art" aria-hidden="true"><mat-icon>{{ c.icon }}</mat-icon></span>
                    <span class="nk-cart__title">{{ c.title }}</span>
                    @if (c.text) {
                      <span class="nk-cart__text">{{ c.text }}</span>
                    }
                    @if (c.pay) {
                      <span class="nk-cart__pay">{{ c.pay }}</span>
                    }
                  </span>
                  <span class="nk-cart__edge" aria-hidden="true"><span class="nk-cart__pins"></span></span>
                </button>
              }
            </div>
            <div class="gs-rail" aria-hidden="true">
              <span class="gs-rail__tag">{{ shelf.label }}</span>
              <span class="nk-slot gs-slot"></span>
              <span class="nk-led nk-led--dot nk-led--own"></span>
            </div>
          </div>
        }
      </div>
      <footer class="nk-dialog__foot">
        <button type="button" class="nk-key" mat-dialog-close>Schließen</button>
      </footer>
    </div>
  `,
  styles: `
    .gs {
      width: 1240px;
      max-width: 100%;
      max-height: 92vh;
    }
    .gs-head {
      gap: 14px;
    }
    .gs-ico {
      color: var(--nk-iv);
      filter: drop-shadow(0 0 4px rgb(255 226 176 / 0.6));
    }
    .gs-title {
      flex: 0 0 auto;
      font-size: 24px;
      letter-spacing: 3px;
    }
    .gs-flex {
      flex: 1;
    }
    .gs-body {
      gap: 26px;
      padding: 30px 22px 22px;
      overflow-y: auto;
    }
    .gs-shelf {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
      gap: 22px;
      align-items: end;
      padding: 0 14px;
    }
    .nk-cart {
      height: 292px;
    }
    .nk-cart[disabled] {
      cursor: default;
    }
    .gs-art {
      height: 78px;
      margin: 4px 0 2px;
      border-radius: 3px;
      display: grid;
      place-items: center;
      color: var(--nk-paper-ink);
      background: repeating-linear-gradient(0deg, rgb(31 27 22 / 0.06) 0 1px, transparent 1px 4px);
      box-shadow: inset 0 0 0 1.5px var(--nk-paper-ink);
    }
    .gs-art .mat-icon {
      width: 48px;
      height: 48px;
      font-size: 48px;
    }
    .gs-rail {
      height: 26px;
      margin: 0 -6px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 12px;
      background: linear-gradient(180deg, #2a2620, #171410);
      box-shadow: inset 0 2px 0 rgb(255 226 176 / 0.14), inset 0 -2px 0 rgb(0 0 0 / 0.6), 0 3px 8px rgb(0 0 0 / 0.7);
    }
    .gs-rail__tag {
      font: 700 10px/1 var(--nk-font-ui);
      letter-spacing: 2px;
      color: var(--nk-iv-2);
      white-space: nowrap;
    }
    .gs-slot {
      flex: 1;
      height: 8px;
    }
    @media (max-width: 700px) {
      .gs-hint {
        display: none;
      }
      .gs-shelf {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
        padding: 0;
      }
      .nk-cart {
        height: 250px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class GameSelectionDialogComponent {
  /** Steckmodule 1:1 wie die bisherigen Spielkarten (Badge, Titel, Untertitel, Auszahlung) */
  readonly carts = [
    { key: 'arkanoid', kind: 'SPIELEN', title: 'ARKANOID', text: 'Zerstöre alle Blöcke!', pay: 'N$ pro Level', color: '#4E7BA6', icon: 'sports_tennis' },
    { key: 'hotdog', kind: 'SPIELEN', title: 'HOTDOG KATAPULT', text: 'Stopfe die Mäuler!', pay: '1 N$/Treffer', color: '#B8702A', icon: 'lunch_dining' },
    { key: 'plinko', kind: 'CASINO', title: 'PLINKO', text: 'Drop & Win!', pay: '0.2x - 50x', color: '#93271F', icon: 'scatter_plot' },
    { key: 'slot', kind: 'CASINO', title: 'SLOT MACHINE', text: 'Pull the lever!', pay: '1x - 100x', color: '#7E6212', icon: 'casino' },
    { key: 'kayberg', kind: 'MODUL 05', title: 'KAYBERG HUNTER', text: 'Jage als Greifvogel!', pay: 'N$ pro Level', color: '#22635F', icon: 'flight' },
    { key: 'weinfest', kind: 'MODUL 06', title: 'WEINFEST SHOOTER', text: 'Schieß die Flaschen ab!', pay: '+3/-2 N$', color: '#7A2E4A', icon: 'wine_bar' },
    { key: 'sandwich', kind: 'NEU', title: 'SANDWICHMASTER', text: 'Baue das ultimative Sandwich!', pay: 'Punkte sammeln', color: '#5E7426', icon: 'bakery_dining', isNew: true },
    { key: '', kind: 'COMING SOON', title: 'Mary Haze – The Game', text: '', pay: '', color: '#5A5346', icon: 'local_florist', soon: true },
    { key: '', kind: 'COMING SOON', title: 'Fehlersuche mit Paddi', text: '', pay: '', color: '#5A5346', icon: 'search', soon: true },
    { key: '', kind: 'COMING SOON', title: 'Mixe das perfekte Spezi', text: '', pay: '', color: '#5A5346', icon: 'local_bar', soon: true },
  ];
  readonly shelves = [
    { label: 'SCHACHT A · SPIELEN & CASINO', carts: this.carts.slice(0, 5) },
    { label: 'SCHACHT B · NEU & DEMNÄCHST', carts: this.carts.slice(5) },
  ];

  start(key: string): void {
    switch (key) {
      case 'arkanoid': return void this.startArkanoid();
      case 'hotdog': return void this.startHotdog();
      case 'plinko': return void this.startPlinko();
      case 'slot': return void this.startSlotMachine();
      case 'kayberg': return void this.startKayberg();
      case 'weinfest': return void this.startWeinfestShooter();
      case 'sandwich': return void this.startSandwichmaster();
    }
  }

  private readonly dialogRef = inject(MatDialogRef<GameSelectionDialogComponent>);
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(AuthService);

  readonly isAdmin = computed(() => this.auth.currentUser()?.role === 'admin');

  async startArkanoid(): Promise<void> {
    this.dialogRef.close();
    const { ArkanoidGameComponent } = await import('./games/arkanoid/arkanoid-game.component');
    this.dialog.open(ArkanoidGameComponent, {
      width: '95vw',
      maxWidth: '800px',
      height: 'auto',
      maxHeight: '95vh',
      panelClass: ['dark-dialog', 'game-dialog'],
      disableClose: true,
    });
  }

  async startHotdog(): Promise<void> {
    this.dialogRef.close();
    const { HotdogGameComponent } = await import('./games/hotdog-katapult/hotdog-game.component');
    this.dialog.open(HotdogGameComponent, {
      width: 'auto',
      maxWidth: '95vw',
      height: 'auto',
      maxHeight: '95vh',
      panelClass: ['dark-dialog', 'game-dialog'],
      disableClose: true,
    });
  }

  async startPlinko(): Promise<void> {
    this.dialogRef.close();
    const { PlinkoGameComponent } = await import('./games/plinko/plinko-game.component');
    this.dialog.open(PlinkoGameComponent, {
      width: '95vw',
      maxWidth: '900px',
      height: 'auto',
      maxHeight: '95vh',
      panelClass: ['dark-dialog', 'game-dialog'],
      disableClose: true,
    });
  }

  async startSlotMachine(): Promise<void> {
    this.dialogRef.close();
    const { SlotMachineGameComponent } = await import('./games/slot-machine/slot-machine-game.component');
    this.dialog.open(SlotMachineGameComponent, {
      width: '950px',
      maxWidth: '95vw',
      panelClass: ['dark-dialog', 'game-dialog'],
      disableClose: true,
    });
  }

  async startKayberg(): Promise<void> {
    this.dialogRef.close();
    const { KaybergGameComponent } = await import('./games/kayberg/kayberg-game.component');
    this.dialog.open(KaybergGameComponent, {
      width: '95vw',
      maxWidth: '950px',
      height: 'auto',
      maxHeight: '95vh',
      panelClass: ['dark-dialog', 'game-dialog'],
      disableClose: true,
    });
  }

  async startWeinfestShooter(): Promise<void> {
    this.dialogRef.close();
    const { WeinfestShooterGameComponent } = await import('./games/weinfest-shooter/weinfest-shooter-game.component');
    this.dialog.open(WeinfestShooterGameComponent, {
      width: '95vw',
      maxWidth: '900px',
      height: 'auto',
      maxHeight: '95vh',
      panelClass: ['dark-dialog', 'game-dialog'],
      disableClose: true,
    });
  }

  async startSandwichmaster(): Promise<void> {
    this.dialogRef.close();
    const { SandwichmasterGameComponent } = await import('./games/sandwichmaster/sandwichmaster-game.component');
    this.dialog.open(SandwichmasterGameComponent, {
      width: '95vw',
      maxWidth: '850px',
      height: 'auto',
      maxHeight: '95vh',
      panelClass: ['dark-dialog', 'game-dialog'],
      disableClose: true,
    });
  }
}
