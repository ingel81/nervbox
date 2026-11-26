import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CreditService } from '../../core/services/credit.service';
import { InventoryService } from '../../core/services/inventory.service';

interface ShopItem {
  id: string;
  name: string;
  emoji: string;
  price: number;
  status: 'available' | 'coming_soon' | 'sold_out' | 'never';
  description: string;
  category: string;
}

@Component({
  selector: 'app-shop-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  template: `
    <div class="nk-dlg shop">
      <header class="nk-dialog__head shop-head">
        <span class="nk-logo__stripes" aria-hidden="true"><span class="nk-logo__stripe"></span><span class="nk-logo__stripe nk-logo__stripe--2"></span><span class="nk-logo__stripe nk-logo__stripe--3"></span><span class="nk-logo__stripe nk-logo__stripe--4"></span><span class="nk-logo__stripe nk-logo__stripe--5"></span></span>
        <h2 class="nk-dialog__title shop-title">Nervbox Shop</h2>
        <span class="nk-label">Guthaben</span>
        <span class="nk-counter" [attr.aria-label]="'Guthaben ' + creditService.creditsFormatted() + ' Schekel'">{{ creditService.creditsFormatted() }} N$</span>
        <span class="nk-label">Holz</span>
        <span class="nk-counter" [attr.aria-label]="'Holz-Bestand ' + inventoryService.wood()">{{ inventoryService.wood() }} HOLZ</span>
        <button type="button" class="nk-key nk-key--sm nk-key--icon shop-close" aria-label="Shop schließen" (click)="close()">✕</button>
      </header>
      <div class="nk-dialog__body shop-body">
        <label class="nk-input shop-search">
          <svg class="nk-input__icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>
          <input class="nk-input__field" type="text" aria-label="Items durchsuchen" placeholder="Items durchsuchen..." [value]="searchQuery()" (input)="onSearch($event)" />
          <button type="button" class="nk-input__clear" aria-label="Suche leeren" [disabled]="!searchQuery()" (click)="clearSearch()">✕</button>
        </label>
        <h3 class="nk-section__title">{{ searchQuery() ? 'Suchergebnisse' : 'Alle Items' }} ({{ filteredItems().length }})</h3>
        @if (filteredItems().length === 0) {
          <div class="nk-empty shop-empty"><span class="nk-empty__text">Keine Items gefunden für "{{ searchQuery() }}"</span></div>
        } @else {
          <div class="shop-grid">
            @for (item of filteredItems(); track item.id) {
              <article [class]="'nk-item ' + itemClass(item.status)" [attr.data-category]="item.category" [attr.aria-label]="item.name">
                <span class="nk-item__head">
                  <span [class]="'nk-led nk-led--dot ' + ledClass(item.status)" aria-hidden="true"></span>
                  <span class="nk-item__status">{{ getStatusLabel(item.status) }}</span>
                  <span class="shop-flex"></span>
                  <span class="nk-item__glyph" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path [attr.d]="iconFor(item.category)"></path></svg>
                  </span>
                </span>
                <span class="nk-item__name" [title]="item.name">{{ item.name }}</span>
                <span class="nk-item__desc">{{ item.description }}</span>
                <span class="nk-item__foot">
                  <span class="nk-counter" [attr.aria-label]="'Preis ' + formatPrice(item.price) + ' Schekel'">{{ formatPrice(item.price) }} N$</span>
                </span>
                @if (item.status === 'available') {
                  <button type="button" class="nk-key nk-key--sm nk-key--accent" [disabled]="isPurchasing() || !canAffordItem(item)" (click)="purchaseItem(item)">
                    @if (isPurchasing()) {
                      <span class="nk-spin" aria-hidden="true"></span>
                    } @else {
                      {{ canAffordItem(item) ? 'KAUFEN' : 'ZU ARM' }}
                    }
                  </button>
                } @else {
                  <button type="button" class="nk-key nk-key--sm nk-key--ghost" disabled>{{ getButtonLabel(item.status) }}</button>
                }
              </article>
            }
          </div>
        }
      </div>
      <footer class="nk-dialog__foot shop-foot">
        <span class="shop-disclaimer">* Alle Verkäufe sind endgültig. Keine Rückgabe. Holz ist Holz.</span>
        <button type="button" class="nk-key" (click)="close()">Schließen</button>
      </footer>
    </div>
  `,
  styles: `
    .shop {
      width: 1180px;
      max-width: 100%;
      max-height: 90vh;
    }
    .shop-head {
      gap: 14px;
    }
    .shop-title {
      font-size: 24px;
      letter-spacing: 3px;
    }
    .shop-close {
      margin-left: 8px;
    }
    .shop-body {
      gap: 14px;
      overflow-y: auto;
    }
    .shop-search {
      width: 360px;
      max-width: 100%;
      margin: 2px 3px 0;
    }
    .shop-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 14px;
      padding: 6px 5px;
    }
    .shop-flex {
      flex: 1;
    }
    .shop-empty {
      padding: 20px 6px;
    }
    .shop-foot {
      justify-content: space-between;
    }
    .shop-disclaimer {
      font: 500 12px var(--nk-font-mono);
      color: var(--nk-iv-2);
    }
    @media (max-width: 700px) {
      .shop-head .nk-label {
        display: none;
      }
      .shop-title {
        font-size: 18px;
        letter-spacing: 1.5px;
      }
      .shop-head .nk-logo__stripes {
        display: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class ShopDialogComponent {
  readonly creditService = inject(CreditService);
  readonly inventoryService = inject(InventoryService);
  private readonly dialogRef = inject(MatDialogRef<ShopDialogComponent>);
  private readonly snackBar = inject(MatSnackBar);

  readonly isPurchasing = signal(false);
  readonly searchQuery = signal('');

  readonly particles = Array.from({ length: 10 }, (_, i) => i);

  // Wood item (purchasable)
  readonly woodItem: ShopItem = {
    id: 'wood',
    name: 'Heiliges Holz',
    emoji: '🪵',
    price: 25000,
    status: 'available',
    description: 'Mysteriös. Mächtig. Holzig.',
    category: 'resource',
  };

  // All shop items
  readonly shopItems: ShopItem[] = [
    // Premium & Power
    {
      id: 'premium',
      name: 'Nervbox Premium',
      emoji: '👑',
      price: 100000,
      status: 'coming_soon',
      description: 'Goldener Rahmen, kein Cooldown',
      category: 'premium',
    },
    {
      id: 'soundstop',
      name: 'Sound Stop Button',
      emoji: '🔇',
      price: 500000,
      status: 'sold_out',
      description: 'Alle Sounds stoppen',
      category: 'premium',
    },
    {
      id: 'goldname',
      name: 'Goldener Username',
      emoji: '✨',
      price: 250000,
      status: 'coming_soon',
      description: 'Name in Gold im Chat',
      category: 'premium',
    },
    {
      id: 'casino_vip',
      name: 'Casino VIP Pass',
      emoji: '🎰',
      price: 1000000,
      status: 'coming_soon',
      description: 'Höhere Gewinnchancen',
      category: 'premium',
    },
    {
      id: 'booster',
      name: 'Shekel Booster',
      emoji: '⚡',
      price: 50000,
      status: 'coming_soon',
      description: '+50% stündlich für 24h',
      category: 'premium',
    },
    {
      id: 'exclusive_sounds',
      name: 'Exclusive Sounds',
      emoji: '🎵',
      price: 200000,
      status: 'coming_soon',
      description: 'Versteckte Premium-Sounds',
      category: 'premium',
    },
    {
      id: 'speed_boost',
      name: 'Sound Speed Boost',
      emoji: '⏩',
      price: 45000,
      status: 'coming_soon',
      description: 'Sounds 1.5x schneller',
      category: 'premium',
    },
    {
      id: 'mystery_box',
      name: 'Mystery Box',
      emoji: '📦',
      price: 10000,
      status: 'coming_soon',
      description: 'Zufällig, evtl. leer',
      category: 'premium',
    },

    // Cosmetics
    {
      id: 'rainbow',
      name: 'Regenbogen-Name',
      emoji: '🌈',
      price: 180000,
      status: 'coming_soon',
      description: 'RGB-Animation im Chat',
      category: 'cosmetic',
    },
    {
      id: 'flames',
      name: 'Flammen-Avatar',
      emoji: '🔥',
      price: 90000,
      status: 'coming_soon',
      description: 'Avatar brennt permanent',
      category: 'cosmetic',
    },
    {
      id: 'crown',
      name: 'Kronen-Emoji',
      emoji: '👑',
      price: 60000,
      status: 'coming_soon',
      description: 'Krone neben Name',
      category: 'cosmetic',
    },
    {
      id: 'diamond',
      name: 'Diamant-Rand',
      emoji: '💎',
      price: 300000,
      status: 'coming_soon',
      description: 'Sparkling Diamond Border',
      category: 'cosmetic',
    },
    {
      id: 'hotdog_aura',
      name: 'Hotdog-Aura',
      emoji: '🌭',
      price: 40000,
      status: 'coming_soon',
      description: 'Fliegende Hotdogs',
      category: 'cosmetic',
    },

    // Fun & Troll
    {
      id: 'gold_wood',
      name: 'Goldene Holz-Edition',
      emoji: '🪵✨',
      price: 100000,
      status: 'coming_soon',
      description: 'Holz aber GOLDEN',
      category: 'fun',
    },
    {
      id: 'paddi',
      name: "Paddi's Segen",
      emoji: '😈',
      price: 666000,
      status: 'sold_out',
      description: 'Mystische Aura',
      category: 'fun',
    },
    {
      id: 'admin_day',
      name: 'Admin für 1 Tag',
      emoji: '🛡️',
      price: 10000000,
      status: 'never',
      description: 'Nur zur Show',
      category: 'fun',
    },
    {
      id: 'infinite',
      name: 'Infinite Shekel',
      emoji: '∞',
      price: 999000000,
      status: 'sold_out',
      description: 'Perma-Ausverkauft',
      category: 'fun',
    },

    // Meta & Absurd
    {
      id: 'nft',
      name: 'NFT (Not For Trade)',
      emoji: '🖼️',
      price: 1,
      status: 'coming_soon',
      description: 'Macht nichts',
      category: 'meta',
    },
    {
      id: 'wood_wood',
      name: 'Holz-Holz',
      emoji: '🪵🪵',
      price: 50000,
      status: 'coming_soon',
      description: 'Holz das Holz ist',
      category: 'meta',
    },
    {
      id: 'stone',
      name: 'Der Stein',
      emoji: '🪨',
      price: 420000,
      status: 'sold_out',
      description: 'Ein Stein. Prestige.',
      category: 'meta',
    },
    {
      id: 'secret',
      name: 'Geheimes Item',
      emoji: '❓',
      price: -1,
      status: 'coming_soon',
      description: 'Preis unbekannt',
      category: 'meta',
    },

    // Community
    {
      id: 'vip_lounge',
      name: 'VIP-Lounge Zugang',
      emoji: '🏰',
      price: 500000,
      status: 'coming_soon',
      description: 'Exklusiver Chat-Channel',
      category: 'social',
    },
    {
      id: 'mega_upvote',
      name: 'Mega-Upvote',
      emoji: '⬆️⬆️',
      price: 25000,
      status: 'coming_soon',
      description: 'Upvote zählt 10x',
      category: 'social',
    },

    // Zeitbasiert
    {
      id: 'timemachine',
      name: 'Zeitmaschine',
      emoji: '⏰',
      price: 999000,
      status: 'coming_soon',
      description: 'Sound zur Uhrzeit',
      category: 'time',
    },
    {
      id: 'happy_hour',
      name: 'Happy Hour Boost',
      emoji: '🍻',
      price: 30000,
      status: 'coming_soon',
      description: '+100% 18-20 Uhr',
      category: 'time',
    },

    // Prestige
    {
      id: 'founder',
      name: "Founder's Badge",
      emoji: '🏅',
      price: 1000000,
      status: 'sold_out',
      description: 'OG NERVBOXER',
      category: 'prestige',
    },
    {
      id: 'hall_of_fame',
      name: 'Hall of Fame',
      emoji: '🏆',
      price: 5000000,
      status: 'sold_out',
      description: 'Permanent in HoF',
      category: 'prestige',
    },
    {
      id: 'own_sound',
      name: 'Eigener Sound-Slot',
      emoji: '🎤',
      price: 10000000,
      status: 'sold_out',
      description: 'EINEN Sound hochladen',
      category: 'prestige',
    },

    // Seasonal
    {
      id: 'xmas',
      name: 'Weihnachts-Skin',
      emoji: '🎄',
      price: 50000,
      status: 'coming_soon',
      description: 'Festliche Dekoration',
      category: 'seasonal',
    },
    {
      id: 'cabd2025',
      name: 'CABD 2025 Badge',
      emoji: '🎉',
      price: 25000,
      status: 'coming_soon',
      description: 'Exklusives Event-Badge',
      category: 'seasonal',
    },
    {
      id: 'silvester',
      name: 'Silvester-Rakete',
      emoji: '🎆',
      price: 30000,
      status: 'coming_soon',
      description: 'Partikel-Effekt',
      category: 'seasonal',
    },
    {
      id: 'birthday',
      name: 'Geburtstags-Hut',
      emoji: '🎂',
      price: 15000,
      status: 'coming_soon',
      description: 'Lustiger Hut',
      category: 'seasonal',
    },
  ];

  // Combined list with wood first
  readonly allItems: ShopItem[] = [this.woodItem, ...this.shopItems];

  // Filtered items based on search
  readonly filteredItems = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return this.allItems;

    return this.allItems.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        item.emoji.includes(query),
    );
  });

  onSearch(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  canAffordItem(item: ShopItem): boolean {
    return this.creditService.credits() >= item.price;
  }

  purchaseItem(item: ShopItem): void {
    if (item.status !== 'available' || this.isPurchasing()) return;

    // Currently only wood is purchasable
    if (item.id === 'wood') {
      this.purchaseWood();
    }
  }

  private purchaseWood(): void {
    if (this.isPurchasing()) return;

    this.isPurchasing.set(true);

    this.inventoryService.purchaseWood(1).subscribe({
      next: (response) => {
        this.isPurchasing.set(false);
        if (response.success) {
          this.creditService.loadCredits();
          this.snackBar.open(response.message, 'OK', {
            duration: 4000,
            panelClass: 'success-snackbar',
          });
        } else {
          this.snackBar.open(response.message, 'OK', {
            duration: 4000,
            panelClass: 'error-snackbar',
          });
        }
      },
      error: (err) => {
        this.isPurchasing.set(false);
        const message = err.error?.Error || 'Kauf fehlgeschlagen!';
        this.snackBar.open(message, 'OK', {
          duration: 4000,
          panelClass: 'error-snackbar',
        });
      },
    });
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'available':
        return 'KAUFBAR';
      case 'coming_soon':
        return 'BALD';
      case 'sold_out':
        return 'AUSVERKAUFT';
      case 'never':
        return 'NIEMALS';
      default:
        return '';
    }
  }

  getButtonLabel(status: string): string {
    switch (status) {
      case 'coming_soon':
        return 'VORBESTELLEN';
      case 'sold_out':
        return 'AUSVERKAUFT';
      case 'never':
        return 'TRÄUM WEITER';
      default:
        return 'N/A';
    }
  }

  formatPrice(price: number): string {
    if (price < 0) return '???';
    if (price >= 1000000) return `${(price / 1000000).toFixed(1)}M`;
    if (price >= 1000) return `${(price / 1000).toFixed(0)}K`;
    return price.toString();
  }

  itemClass(status: ShopItem['status']): string {
    return { available: 'nk-item--available', coming_soon: 'nk-item--soon', sold_out: 'nk-item--sold', never: 'nk-item--never' }[status];
  }

  ledClass(status: ShopItem['status']): string {
    return { available: 'nk-led--own', coming_soon: 'nk-led--warn', sold_out: 'nk-led--danger', never: 'nk-led--other' }[status];
  }

  /** Glyphe im Leuchtfenster je Kategorie (ersetzt die Emojis) */
  iconFor(category: string): string {
    const icons: Record<string, string> = {
      resource: 'M4 8h13a3 4 0 010 8H4M4 8a3 4 0 100 8 3 4 0 100-8zM4 10.5a1 1.5 0 100 3',
      premium: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
      cosmetic: 'M6 4h12l3 5-9 11L3 9zM3 9h18M9 4l3 16M15 4l-3 16',
      fun: 'M12 3a9 9 0 110 18 9 9 0 010-18zM8 14c1 2 2.5 3 4 3s3-1 4-3M9 9.5h.01M15 9.5h.01',
      meta: 'M12 3a9 9 0 110 18 9 9 0 010-18zM9.5 9.5a2.5 2.5 0 115 0c0 2-2.5 2-2.5 4M12 17h.01',
      social: 'M9 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 11a3 3 0 100-6M21 20c0-3-2-5.4-4.5-5.9',
      time: 'M12 3a9 9 0 110 18 9 9 0 010-18zM12 7v5l3 2',
      prestige: 'M4 8l4 4 4-7 4 7 4-4-2 11H6zM6 21h12',
      seasonal: 'M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9',
    };
    return icons[category] ?? icons['premium'];
  }

  close(): void {
    this.dialogRef.close();
  }
}
