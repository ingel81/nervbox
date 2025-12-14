import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api.service';
import { User, LoginRequest, RegisterRequest } from '../models';

const TOKEN_KEY = 'nervbox_token';
const USER_KEY = 'nervbox_user';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly api = inject(ApiService);

  // State
  readonly currentUser = signal<User | null>(this.loadUserFromStorage());
  readonly isLoggedIn = computed(() => this.currentUser() !== null);
  readonly token = signal<string | null>(this.loadTokenFromStorage());

  login(credentials: LoginRequest): Observable<User> {
    return this.api.post<User>('/users/auth/login', credentials).pipe(
      tap(user => this.handleAuthSuccess(user))
    );
  }

  register(data: RegisterRequest): Observable<User> {
    return this.api.post<User>('/users/auth/register', data).pipe(
      tap(user => this.handleAuthSuccess(user))
    );
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.currentUser.set(null);
    this.token.set(null);
  }

  getToken(): string | null {
    return this.token();
  }

  private handleAuthSuccess(user: User): void {
    if (user.token) {
      localStorage.setItem(TOKEN_KEY, user.token);
      this.token.set(user.token);
    }
    // Store user without token
    const userWithoutToken = { ...user };
    delete userWithoutToken.token;
    localStorage.setItem(USER_KEY, JSON.stringify(userWithoutToken));
    this.currentUser.set(userWithoutToken);
  }

  private loadTokenFromStorage(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  private loadUserFromStorage(): User | null {
    const userJson = localStorage.getItem(USER_KEY);
    if (userJson) {
      try {
        return JSON.parse(userJson);
      } catch {
        return null;
      }
    }
    return null;
  }
}
