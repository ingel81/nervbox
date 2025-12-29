import { Component, inject, signal, computed } from '@angular/core';
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
    <div class="shop-container">
      <!-- EPIC HEADER -->
      <div class="shop-header">
        <div class="header-glow"></div>
        <div class="header-particles">
          @for (i of particles; track i) {
            <div class="particle" [style.--delay]="i * 0.5 + 's'" [style.--x]="(i * 17) % 100 + '%'"></div>
          }
        </div>
        <div class="header-content">
          <div class="logo-container">
            <span class="sparkle left">✨</span>
            <h1 class="shop-title">NERVBOX SHOP</h1>
            <span class="sparkle right">✨</span>
          </div>
        </div>
        <button mat-icon-button class="close-btn" (click)="close()">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <!-- BALANCE BAR -->
      <div class="balance-bar">
        <div class="balance-item shekel">
          <img src="icons/nervbox-coin.svg" alt="" class="balance-icon">
          <span class="balance-value">{{ creditService.creditsFormatted() }}</span>
          <span class="balance-label">N$</span>
        </div>
        <div class="balance-divider"></div>
        <div class="balance-item wood">
          <img src="icons/nervbox-log.svg" alt="" class="balance-icon wood-icon">
          <span class="balance-value">{{ inventoryService.wood() }}</span>
          <span class="balance-label">Holz</span>
        </div>
      </div>

      <!-- MAIN CONTENT -->
      <mat-dialog-content class="shop-content">
        <!-- SEARCH BAR -->
        <div class="search-bar">
          <mat-icon>search</mat-icon>
          <input
            type="text"
            placeholder="Items durchsuchen..."
            [value]="searchQuery()"
            (input)="onSearch($event)"
          >
          @if (searchQuery()) {
            <button class="clear-search" (click)="clearSearch()">
              <mat-icon>close</mat-icon>
            </button>
          }
        </div>

        <div class="items-section">
          <div class="section-header">
            <mat-icon>storefront</mat-icon>
            <h2>{{ searchQuery() ? 'SUCHERGEBNISSE' : 'ALLE ITEMS' }} ({{ filteredItems().length }})</h2>
            <mat-icon>storefront</mat-icon>
          </div>

          @if (filteredItems().length === 0) {
            <div class="no-results">
              <mat-icon>search_off</mat-icon>
              <p>Keine Items gefunden für "{{ searchQuery() }}"</p>
            </div>
          }

          <div class="items-grid">
            @for (item of filteredItems(); track item.id) {
              <div class="shop-item" [class]="'status-' + item.status" [attr.data-category]="item.category">
                <div class="item-badge" [class]="item.status">
                  {{ getStatusLabel(item.status) }}
                </div>

                <span class="item-emoji">{{ item.emoji }}</span>
                <span class="item-title">{{ item.name }}</span>
                <span class="item-desc">{{ item.description }}</span>

                <div class="item-price">
                  <img src="icons/nervbox-coin.svg" alt="" class="mini-coin">
                  <span>{{ formatPrice(item.price) }}</span>
                </div>

                @if (item.status === 'available') {
                  <button
                    class="item-button available"
                    [disabled]="isPurchasing() || !canAffordItem(item)"
                    (click)="purchaseItem(item)"
                  >
                    @if (isPurchasing()) {
                      <mat-spinner diameter="14"></mat-spinner>
                    } @else {
                      {{ canAffordItem(item) ? 'KAUFEN' : 'ZU ARM' }}
                    }
                  </button>
                } @else {
                  <button class="item-button" disabled>
                    {{ getButtonLabel(item.status) }}
                  </button>
                }
              </div>
            }
          </div>
        </div>
      </mat-dialog-content>

      <!-- FOOTER -->
      <div class="shop-footer">
        <p class="disclaimer">* Alle Verkäufe sind endgültig. Keine Rückgabe. Holz ist Holz.</p>
        <button mat-button (click)="close()">Schließen</button>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 85vh;
      max-height: 85vh;
    }

    .shop-container {
      background: linear-gradient(180deg, #0a0a1a 0%, #1a0f2e 50%, #0a0a1a 100%);
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    /* === EPIC HEADER === */
    .shop-header {
      position: relative;
      padding: 30px 24px 20px;
      background: linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(249, 115, 22, 0.1) 50%, rgba(147, 51, 234, 0.1) 100%);
      border-bottom: 2px solid rgba(251, 191, 36, 0.4);
      overflow: hidden;
    }

    .header-glow {
      position: absolute;
      top: -100%;
      left: -50%;
      width: 200%;
      height: 300%;
      background: radial-gradient(circle, rgba(251, 191, 36, 0.2) 0%, transparent 50%);
      animation: header-rotate 20s linear infinite;
    }

    @keyframes header-rotate {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .header-particles {
      position: absolute;
      inset: 0;
      overflow: hidden;
      pointer-events: none;
    }

    .particle {
      position: absolute;
      bottom: -10px;
      left: var(--x);
      width: 8px;
      height: 8px;
      background: #fbbf24;
      border-radius: 50%;
      animation: particle-rise 4s ease-out infinite;
      animation-delay: var(--delay);
      opacity: 0;
    }

    @keyframes particle-rise {
      0% { transform: translateY(0) scale(0); opacity: 0; }
      10% { opacity: 1; }
      100% { transform: translateY(-200px) scale(0); opacity: 0; }
    }

    .header-content {
      position: relative;
      z-index: 1;
      text-align: center;
    }

    .logo-container {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
    }

    .sparkle {
      font-size: 32px;
      animation: sparkle-pulse 1.5s ease-in-out infinite;
    }

    .sparkle.left { animation-delay: 0s; }
    .sparkle.right { animation-delay: 0.75s; }

    @keyframes sparkle-pulse {
      0%, 100% { opacity: 0.5; transform: scale(0.8); }
      50% { opacity: 1; transform: scale(1.2); }
    }

    .shop-title {
      font-family: 'JetBrains Mono', monospace;
      font-size: 36px;
      font-weight: 900;
      letter-spacing: 6px;
      margin: 0;
      background: linear-gradient(135deg, #fde047 0%, #fbbf24 30%, #f97316 60%, #fbbf24 100%);
      background-size: 200% 200%;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      animation: gold-shimmer 3s ease infinite;
      text-shadow: 0 0 30px rgba(251, 191, 36, 0.5);
    }

    @keyframes gold-shimmer {
      0%, 100% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
    }

    .close-btn {
      position: absolute;
      top: 16px;
      right: 16px;
      color: rgba(255, 255, 255, 0.6);
      z-index: 2;
    }

    .close-btn:hover {
      color: white;
    }

    /* === BALANCE BAR === */
    .balance-bar {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 24px;
      padding: 16px;
      background: rgba(0, 0, 0, 0.3);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .balance-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: 20px;
    }

    .balance-item.shekel {
      background: linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(249, 115, 22, 0.1) 100%);
      border: 1px solid rgba(251, 191, 36, 0.4);
    }

    .balance-item.wood {
      background: linear-gradient(135deg, rgba(46, 125, 50, 0.15) 0%, rgba(27, 94, 32, 0.1) 100%);
      border: 1px solid rgba(46, 125, 50, 0.4);
    }

    .balance-icon {
      width: 28px;
      height: 28px;
    }

    .balance-icon.wood-icon {
      width: 22px;
      height: 22px;
    }

    .balance-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 18px;
      font-weight: 700;
      color: #fde047;
    }

    .balance-item.wood .balance-value {
      color: #81c784;
    }

    .balance-label {
      font-size: 14px;
      color: rgba(255, 255, 255, 0.6);
    }

    .balance-divider {
      width: 1px;
      height: 30px;
      background: rgba(255, 255, 255, 0.2);
    }

    /* === MAIN CONTENT === */
    .shop-content {
      flex: 1 1 auto;
      padding: 24px !important;
      overflow-y: auto !important;
      overflow-x: hidden;
      min-height: 0;
      max-height: none !important;
    }

    /* Custom scrollbar */
    .shop-content::-webkit-scrollbar {
      width: 8px;
    }

    .shop-content::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.2);
      border-radius: 4px;
    }

    .shop-content::-webkit-scrollbar-thumb {
      background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%);
      border-radius: 4px;
    }

    .shop-content::-webkit-scrollbar-thumb:hover {
      background: linear-gradient(135deg, #a855f7 0%, #f472b6 100%);
    }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      margin-bottom: 20px;
    }

    .section-header mat-icon {
      color: #fbbf24;
      font-size: 24px;
      width: 24px;
      height: 24px;
    }

    .section-header h2 {
      font-family: 'JetBrains Mono', monospace;
      font-size: 18px;
      font-weight: 800;
      color: white;
      letter-spacing: 3px;
      margin: 0;
    }

    /* === SEARCH BAR === */
    .search-bar {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      margin-bottom: 16px;
    }

    .search-bar mat-icon {
      color: rgba(255, 255, 255, 0.4);
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .search-bar input {
      width: 180px;
      padding: 6px 10px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      outline: none;
      color: white;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      transition: all 0.2s;
    }

    .search-bar input:focus {
      border-color: rgba(251, 191, 36, 0.4);
      background: rgba(255, 255, 255, 0.08);
    }

    .search-bar input::placeholder {
      color: rgba(255, 255, 255, 0.3);
    }

    .clear-search {
      background: transparent;
      border: none;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      opacity: 0.5;
      transition: opacity 0.2s;
    }

    .clear-search:hover {
      opacity: 1;
    }

    .clear-search mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }

    .no-results {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 40px;
      color: rgba(255, 255, 255, 0.5);
    }

    .no-results mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      opacity: 0.5;
    }

    .no-results p {
      margin: 0;
      font-size: 14px;
    }

    /* === ITEMS GRID === */
    .items-section {
      margin-top: 0;
    }

    .items-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 16px;
    }

    .shop-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 16px 12px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      position: relative;
      transition: all 0.3s;
    }

    .shop-item:hover {
      background: rgba(255, 255, 255, 0.06);
      transform: translateY(-2px);
    }

    .shop-item.status-available {
      border-color: rgba(34, 197, 94, 0.5);
      background: linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(22, 163, 74, 0.05) 100%);
      box-shadow: 0 0 20px rgba(34, 197, 94, 0.2);
    }

    .shop-item.status-available:hover {
      border-color: rgba(34, 197, 94, 0.8);
      box-shadow: 0 0 30px rgba(34, 197, 94, 0.4);
    }

    .shop-item.status-coming_soon {
      border-color: rgba(147, 51, 234, 0.3);
    }

    .shop-item.status-sold_out {
      border-color: rgba(239, 68, 68, 0.3);
      opacity: 0.7;
    }

    .shop-item.status-never {
      border-color: rgba(239, 68, 68, 0.5);
      background: rgba(239, 68, 68, 0.05);
    }

    .item-badge.available {
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
      color: white;
      animation: badge-pulse 1.5s ease-in-out infinite;
    }

    @keyframes badge-pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }

    .item-badge {
      position: absolute;
      top: 8px;
      right: 8px;
      padding: 3px 8px;
      border-radius: 8px;
      font-size: 8px;
      font-weight: 800;
      letter-spacing: 0.5px;
    }

    .item-badge.coming_soon {
      background: linear-gradient(135deg, #9333ea 0%, #7c3aed 100%);
      color: white;
    }

    .item-badge.sold_out {
      background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
      color: white;
    }

    .item-badge.never {
      background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
      color: #ef4444;
      border: 1px solid #ef4444;
    }

    .item-emoji {
      font-size: 36px;
      margin-bottom: 4px;
    }

    .item-title {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 700;
      color: white;
      text-align: center;
      line-height: 1.2;
    }

    .item-desc {
      font-size: 9px;
      color: rgba(255, 255, 255, 0.5);
      text-align: center;
      line-height: 1.3;
      min-height: 24px;
    }

    .item-price {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 4px;
    }

    .mini-coin {
      width: 14px;
      height: 14px;
    }

    .item-price span {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 700;
      color: #fbbf24;
    }

    .item-button {
      width: 100%;
      padding: 6px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 6px;
      color: rgba(255, 255, 255, 0.4);
      font-size: 9px;
      font-weight: 600;
      cursor: not-allowed;
      margin-top: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
    }

    .item-button.available {
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
      border-color: #22c55e;
      color: white;
      cursor: pointer;
      transition: all 0.2s;
    }

    .item-button.available:hover:not(:disabled) {
      transform: scale(1.05);
      box-shadow: 0 4px 15px rgba(34, 197, 94, 0.5);
    }

    .item-button.available:disabled {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.2);
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    /* === FOOTER === */
    .shop-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 24px;
      background: rgba(0, 0, 0, 0.3);
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .disclaimer {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.4);
      margin: 0;
      font-style: italic;
    }

    .shop-footer button {
      color: rgba(255, 255, 255, 0.6);
    }

    .shop-footer button:hover {
      color: white;
    }

    @media (max-width: 600px) {
      .shop-title {
        font-size: 24px;
        letter-spacing: 3px;
      }

      .featured-item {
        flex-direction: column;
        align-items: center;
        text-align: center;
      }

      .item-visual {
        width: 140px;
        height: 140px;
      }

      .wood-big-icon {
        width: 80px;
        height: 80px;
      }

      .items-grid {
        grid-template-columns: repeat(2, 1fr);
      }

      .balance-bar {
        flex-wrap: wrap;
      }
    }
  `,
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
    { id: 'premium', name: 'Nervbox Premium', emoji: '👑', price: 100000, status: 'coming_soon', description: 'Goldener Rahmen, kein Cooldown', category: 'premium' },
    { id: 'soundstop', name: 'Sound Stop Button', emoji: '🔇', price: 500000, status: 'sold_out', description: 'Alle Sounds stoppen', category: 'premium' },
    { id: 'goldname', name: 'Goldener Username', emoji: '✨', price: 250000, status: 'coming_soon', description: 'Name in Gold im Chat', category: 'premium' },
    { id: 'casino_vip', name: 'Casino VIP Pass', emoji: '🎰', price: 1000000, status: 'coming_soon', description: 'Höhere Gewinnchancen', category: 'premium' },
    { id: 'booster', name: 'Shekel Booster', emoji: '⚡', price: 50000, status: 'coming_soon', description: '+50% stündlich für 24h', category: 'premium' },
    { id: 'exclusive_sounds', name: 'Exclusive Sounds', emoji: '🎵', price: 200000, status: 'coming_soon', description: 'Versteckte Premium-Sounds', category: 'premium' },
    { id: 'speed_boost', name: 'Sound Speed Boost', emoji: '⏩', price: 45000, status: 'coming_soon', description: 'Sounds 1.5x schneller', category: 'premium' },
    { id: 'mystery_box', name: 'Mystery Box', emoji: '📦', price: 10000, status: 'coming_soon', description: 'Zufällig, evtl. leer', category: 'premium' },

    // Cosmetics
    { id: 'rainbow', name: 'Regenbogen-Name', emoji: '🌈', price: 180000, status: 'coming_soon', description: 'RGB-Animation im Chat', category: 'cosmetic' },
    { id: 'flames', name: 'Flammen-Avatar', emoji: '🔥', price: 90000, status: 'coming_soon', description: 'Avatar brennt permanent', category: 'cosmetic' },
    { id: 'crown', name: 'Kronen-Emoji', emoji: '👑', price: 60000, status: 'coming_soon', description: 'Krone neben Name', category: 'cosmetic' },
    { id: 'diamond', name: 'Diamant-Rand', emoji: '💎', price: 300000, status: 'coming_soon', description: 'Sparkling Diamond Border', category: 'cosmetic' },
    { id: 'hotdog_aura', name: 'Hotdog-Aura', emoji: '🌭', price: 40000, status: 'coming_soon', description: 'Fliegende Hotdogs', category: 'cosmetic' },

    // Fun & Troll
    { id: 'gold_wood', name: 'Goldene Holz-Edition', emoji: '🪵✨', price: 100000, status: 'coming_soon', description: 'Holz aber GOLDEN', category: 'fun' },
    { id: 'paddi', name: "Paddi's Segen", emoji: '😈', price: 666000, status: 'sold_out', description: 'Mystische Aura', category: 'fun' },
    { id: 'admin_day', name: 'Admin für 1 Tag', emoji: '🛡️', price: 10000000, status: 'never', description: 'Nur zur Show', category: 'fun' },
    { id: 'infinite', name: 'Infinite Shekel', emoji: '∞', price: 999000000, status: 'sold_out', description: 'Perma-Ausverkauft', category: 'fun' },

    // Meta & Absurd
    { id: 'nft', name: 'NFT (Not For Trade)', emoji: '🖼️', price: 1, status: 'coming_soon', description: 'Macht nichts', category: 'meta' },
    { id: 'wood_wood', name: 'Holz-Holz', emoji: '🪵🪵', price: 50000, status: 'coming_soon', description: 'Holz das Holz ist', category: 'meta' },
    { id: 'stone', name: 'Der Stein', emoji: '🪨', price: 420000, status: 'sold_out', description: 'Ein Stein. Prestige.', category: 'meta' },
    { id: 'secret', name: 'Geheimes Item', emoji: '❓', price: -1, status: 'coming_soon', description: 'Preis unbekannt', category: 'meta' },

    // Community
    { id: 'vip_lounge', name: 'VIP-Lounge Zugang', emoji: '🏰', price: 500000, status: 'coming_soon', description: 'Exklusiver Chat-Channel', category: 'social' },
    { id: 'mega_upvote', name: 'Mega-Upvote', emoji: '⬆️⬆️', price: 25000, status: 'coming_soon', description: 'Upvote zählt 10x', category: 'social' },

    // Zeitbasiert
    { id: 'timemachine', name: 'Zeitmaschine', emoji: '⏰', price: 999000, status: 'coming_soon', description: 'Sound zur Uhrzeit', category: 'time' },
    { id: 'happy_hour', name: 'Happy Hour Boost', emoji: '🍻', price: 30000, status: 'coming_soon', description: '+100% 18-20 Uhr', category: 'time' },

    // Prestige
    { id: 'founder', name: "Founder's Badge", emoji: '🏅', price: 1000000, status: 'sold_out', description: 'OG NERVBOXER', category: 'prestige' },
    { id: 'hall_of_fame', name: 'Hall of Fame', emoji: '🏆', price: 5000000, status: 'sold_out', description: 'Permanent in HoF', category: 'prestige' },
    { id: 'own_sound', name: 'Eigener Sound-Slot', emoji: '🎤', price: 10000000, status: 'sold_out', description: 'EINEN Sound hochladen', category: 'prestige' },

    // Seasonal
    { id: 'xmas', name: 'Weihnachts-Skin', emoji: '🎄', price: 50000, status: 'coming_soon', description: 'Festliche Dekoration', category: 'seasonal' },
    { id: 'cabd2025', name: 'CABD 2025 Badge', emoji: '🎉', price: 25000, status: 'coming_soon', description: 'Exklusives Event-Badge', category: 'seasonal' },
    { id: 'silvester', name: 'Silvester-Rakete', emoji: '🎆', price: 30000, status: 'coming_soon', description: 'Partikel-Effekt', category: 'seasonal' },
    { id: 'birthday', name: 'Geburtstags-Hut', emoji: '🎂', price: 15000, status: 'coming_soon', description: 'Lustiger Hut', category: 'seasonal' },
  ];

  // Combined list with wood first
  readonly allItems: ShopItem[] = [this.woodItem, ...this.shopItems];

  // Filtered items based on search
  readonly filteredItems = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return this.allItems;

    return this.allItems.filter(item =>
      item.name.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query) ||
      item.emoji.includes(query)
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
      case 'available': return 'KAUFBAR';
      case 'coming_soon': return 'BALD';
      case 'sold_out': return 'AUSVERKAUFT';
      case 'never': return 'NIEMALS';
      default: return '';
    }
  }

  getButtonLabel(status: string): string {
    switch (status) {
      case 'coming_soon': return 'VORBESTELLEN';
      case 'sold_out': return 'AUSVERKAUFT';
      case 'never': return 'TRÄUM WEITER';
      default: return 'N/A';
    }
  }

  formatPrice(price: number): string {
    if (price < 0) return '???';
    if (price >= 1000000) return `${(price / 1000000).toFixed(1)}M`;
    if (price >= 1000) return `${(price / 1000).toFixed(0)}K`;
    return price.toString();
  }

  close(): void {
    this.dialogRef.close();
  }
}
