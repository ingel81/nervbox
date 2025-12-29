import { Injectable, inject, signal, effect } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

export interface InventoryInfo {
  wood: number;
  woodPrice: number;
}

export interface PurchaseResponse {
  success: boolean;
  itemType: string;
  quantity: number;
  newWoodBalance: number;
  newCreditBalance: number;
  message: string;
}

@Injectable({
  providedIn: 'root',
})
export class InventoryService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  // Inventory state
  readonly wood = signal<number>(10);  // Default 10 wood
  readonly woodPrice = signal<number>(25000);
  readonly isLoading = signal<boolean>(false);

  constructor() {
    // Load inventory when user logs in
    effect(() => {
      if (this.auth.isLoggedIn()) {
        this.loadInventory();
      } else {
        this.wood.set(10);  // Reset to default when logged out
      }
    });
  }

  loadInventory(): void {
    if (!this.auth.isLoggedIn()) return;

    this.isLoading.set(true);
    this.api.get<InventoryInfo>('/shop/inventory').subscribe({
      next: (info) => {
        this.wood.set(info.wood);
        this.woodPrice.set(info.woodPrice);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load inventory:', err);
        this.isLoading.set(false);
      },
    });
  }

  purchaseWood(quantity: number): Observable<PurchaseResponse> {
    return this.api.post<PurchaseResponse>('/shop/purchase', {
      itemType: 'wood',
      quantity: quantity,
    }).pipe(
      tap(response => {
        if (response.success) {
          this.wood.set(response.newWoodBalance);
        }
      })
    );
  }
}
