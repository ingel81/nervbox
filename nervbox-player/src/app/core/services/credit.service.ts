import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { SignalRService } from './signalr.service';

export interface CreditInfo {
  credits: number;
  costPerPlay: number;
  maxCredits: number;
  hourlyCreditsEnabled: boolean;
  hourlyCreditsAmount: number;
}

export interface CreditSettings {
  id: number;
  initialCreditsUser: number;
  initialCreditsAdmin: number;
  costPerSoundPlay: number;
  hourlyCreditsEnabled: boolean;
  hourlyCreditsAmount: number;
  maxCreditsUser: number;
  minCreditsToPlay: number;
}

export interface CreditTransaction {
  id: number;
  amount: number;
  type: string;
  description: string;
  balanceAfter: number;
  createdAt: string;
}

export interface CreditGrantRequest {
  userId: number;
  amount: number;
  reason?: string;
}

export interface CreditGrantResponse {
  userId: number;
  username: string;
  amountGranted: number;
  newBalance: number;
}

export interface GambleResponse {
  won: boolean;
  newBalance: number;
  message: string;
  betAmount: number;
}

export interface TransferResponse {
  success: boolean;
  message: string;
  newBalance: number;
}

export interface MinigameRewardResponse {
  success: boolean;
  gameName: string;
  level: number;
  reward: number;
  newBalance: number;
}

export interface TransferableUser {
  id: number;
  username: string;
}

@Injectable({
  providedIn: 'root',
})
export class CreditService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly signalR = inject(SignalRService);

  // Credit state
  readonly credits = signal<number>(0);
  readonly costPerPlay = signal<number>(1);
  readonly maxCredits = signal<number>(500);
  readonly hourlyCreditsEnabled = signal<boolean>(true);
  readonly hourlyCreditsAmount = signal<number>(5);
  readonly isLoading = signal<boolean>(false);
  readonly lastError = signal<string | null>(null);

  // Computed
  readonly canPlay = computed(() => this.credits() >= this.costPerPlay());
  readonly creditsFormatted = computed(() => {
    const c = this.credits();
    if (c >= 1000000) return `${(c / 1000000).toFixed(1)}M`;
    if (c >= 10000) return `${(c / 1000).toFixed(1)}K`;
    return c.toString();
  });
  readonly creditsTooltip = computed(() => {
    if (this.hourlyCreditsEnabled()) {
      return `+${this.hourlyCreditsAmount()} N$/h`;
    }
    return 'Shekel Konto';
  });

  constructor() {
    // Listen for SignalR credit updates
    effect(() => {
      const update = this.signalR.creditUpdates();
      if (update && update.userId === this.auth.currentUser()?.id) {
        this.credits.set(update.credits);
      }
    });

    // Load credits when user logs in
    effect(() => {
      if (this.auth.isLoggedIn()) {
        this.loadCredits();
      } else {
        this.credits.set(0);
      }
    });
  }

  loadCredits(): void {
    if (!this.auth.isLoggedIn()) return;

    this.isLoading.set(true);
    this.api.get<CreditInfo>('/credit').subscribe({
      next: (info) => {
        this.credits.set(info.credits);
        this.costPerPlay.set(info.costPerPlay);
        this.maxCredits.set(info.maxCredits);
        this.hourlyCreditsEnabled.set(info.hourlyCreditsEnabled);
        this.hourlyCreditsAmount.set(info.hourlyCreditsAmount);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load credits:', err);
        this.isLoading.set(false);
      },
    });
  }

  updateCreditsFromPlayResponse(creditsRemaining: number): void {
    this.credits.set(creditsRemaining);
  }

  getTransactions(limit = 50): Observable<CreditTransaction[]> {
    return this.api.get<CreditTransaction[]>(`/credit/transactions?limit=${limit}`);
  }

  // Admin methods
  getSettings(): Observable<CreditSettings> {
    return this.api.get<CreditSettings>('/credit/settings');
  }

  updateSettings(settings: Partial<CreditSettings>): Observable<CreditSettings> {
    return this.api.put<CreditSettings>('/credit/settings', settings);
  }

  grantCredits(request: CreditGrantRequest): Observable<CreditGrantResponse> {
    return this.api.post<CreditGrantResponse>('/credit/grant', request);
  }

  getUserCredits(userId: number): Observable<{ userId: number; username: string; credits: number; role: string }> {
    return this.api.get(`/credit/user/${userId}`);
  }

  // Gambling
  gamble(amount: number): Observable<GambleResponse> {
    return this.api.post<GambleResponse>('/credit/gamble', { amount }).pipe(
      tap(response => {
        this.credits.set(response.newBalance);
      })
    );
  }

  // Transfer
  getTransferableUsers(): Observable<TransferableUser[]> {
    return this.api.get<TransferableUser[]>('/credit/users');
  }

  transfer(toUserId: number, amount: number): Observable<TransferResponse> {
    return this.api.post<TransferResponse>('/credit/transfer', { toUserId, amount }).pipe(
      tap(response => {
        if (response.success) {
          this.credits.set(response.newBalance);
        }
      })
    );
  }

  // Minigame rewards
  claimMinigameReward(gameName: string, level: number): Observable<MinigameRewardResponse> {
    return this.api.post<MinigameRewardResponse>('/credit/minigame-reward', { gameName, level }).pipe(
      tap(response => {
        if (response.success) {
          this.credits.set(response.newBalance);
        }
      })
    );
  }
}
