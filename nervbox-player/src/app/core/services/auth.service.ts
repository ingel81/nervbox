import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api.service';
import { User, LoginRequest, RegisterRequest } from '../models';

const TOKEN_KEY = 'nervbox_token';

interface JwtPayload {
  unique_name: string; // user id
  userName: string;
  role: string;
  firstName: string;
  lastName: string;
  exp: number;
  nbf: number;
  iat: number;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly api = inject(ApiService);

  // State - User wird aus Token extrahiert
  readonly token = signal<string | null>(this.loadTokenFromStorage());
  readonly currentUser = computed(() => this.extractUserFromToken(this.token()));
  readonly isLoggedIn = computed(() => this.currentUser() !== null);

  login(credentials: LoginRequest): Observable<User> {
    return this.api.post<User>('/users/auth/login', credentials).pipe(
      tap(response => this.handleAuthSuccess(response.token))
    );
  }

  register(data: RegisterRequest): Observable<User> {
    return this.api.post<User>('/users/auth/register', data).pipe(
      tap(response => this.handleAuthSuccess(response.token))
    );
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    this.token.set(null);
  }

  getToken(): string | null {
    return this.token();
  }

  private handleAuthSuccess(token: string | undefined): void {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      this.token.set(token);
    }
  }

  private loadTokenFromStorage(): string | null {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;

    // Prüfe ob Token abgelaufen ist
    const payload = this.decodeToken(token);
    if (!payload || this.isTokenExpired(payload)) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }

    return token;
  }

  private extractUserFromToken(token: string | null): User | null {
    if (!token) return null;

    const payload = this.decodeToken(token);
    if (!payload || this.isTokenExpired(payload)) {
      return null;
    }

    return {
      id: parseInt(payload.unique_name, 10),
      username: payload.userName,
      role: payload.role,
      firstName: payload.firstName || undefined,
      lastName: payload.lastName || undefined,
    };
  }

  private decodeToken(token: string): JwtPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const payload = parts[1];
      const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }

  private isTokenExpired(payload: JwtPayload): boolean {
    const now = Math.floor(Date.now() / 1000);
    return payload.exp < now;
  }
}
