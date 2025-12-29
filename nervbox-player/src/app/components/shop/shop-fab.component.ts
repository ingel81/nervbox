import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { AuthService } from '../../core/services/auth.service';
import { ShopDialogComponent } from './shop-dialog.component';

@Component({
  selector: 'app-shop-fab',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    @if (auth.currentUser()) {
      <button
        class="shop-fab"
        matTooltip="Shop"
        matTooltipPosition="right"
        (click)="openShop()"
      >
        <mat-icon>storefront</mat-icon>
      </button>
    }
  `,
  styles: `
    .shop-fab {
      position: fixed;
      top: calc(50% + 44px);
      left: 0;
      z-index: 50;
      width: 40px;
      height: 40px;
      border-radius: 0 12px 12px 0;
      background: linear-gradient(135deg, #fbbf24 0%, #f97316 100%);
      border: none;
      cursor: pointer;
      box-shadow: 4px 0 20px rgba(251, 191, 36, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      animation: shop-glow 2s ease-in-out infinite;
    }

    .shop-fab:hover {
      transform: translateX(4px);
      box-shadow: 6px 0 30px rgba(251, 191, 36, 0.6);
    }

    .shop-fab:active {
      transform: scale(0.95);
    }

    .shop-fab mat-icon {
      color: white;
      font-size: 22px;
      width: 22px;
      height: 22px;
    }

    @keyframes shop-glow {
      0%,
      100% {
        box-shadow: 0 4px 20px rgba(251, 191, 36, 0.4);
      }
      50% {
        box-shadow:
          0 4px 30px rgba(251, 191, 36, 0.6),
          0 0 40px rgba(249, 115, 22, 0.3);
      }
    }

    @media (max-width: 768px) {
      .shop-fab {
        width: 36px;
        height: 36px;
      }

      .shop-fab mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
    }
  `,
})
export class ShopFabComponent {
  readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);

  openShop(): void {
    this.dialog.open(ShopDialogComponent, {
      width: '1100px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      panelClass: 'dark-dialog',
    });
  }
}
