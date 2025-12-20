import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api.service';
import {
  UserAdmin,
  AdminCreateUserRequest,
  AdminUpdateUserRequest,
  AdminResetPasswordRequest,
  User,
} from '../models/user.model';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private readonly api = inject(ApiService);

  readonly users = signal<UserAdmin[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  loadUsers(): Observable<UserAdmin[]> {
    this.loading.set(true);
    this.error.set(null);

    return this.api.get<UserAdmin[]>('/users/admin').pipe(
      tap({
        next: users => {
          this.users.set(users);
          this.loading.set(false);
        },
        error: err => {
          this.error.set(err.message || 'Failed to load users');
          this.loading.set(false);
        },
      })
    );
  }

  createUser(data: AdminCreateUserRequest): Observable<User> {
    return this.api.post<User>('/users/admin', data).pipe(
      tap(newUser => {
        // Add to local state as UserAdmin
        const userAdmin: UserAdmin = {
          id: newUser.id,
          username: newUser.username,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          ipAddress: '',
          role: newUser.role,
          isActive: true,
          createdAt: newUser.createdAt || new Date().toISOString(),
          credits: 0,
        };
        this.users.update(users => [...users, userAdmin]);
      })
    );
  }

  updateUser(id: number, data: AdminUpdateUserRequest): Observable<User> {
    return this.api.put<User>(`/users/admin/${id}`, data).pipe(
      tap(updatedUser => {
        this.users.update(users =>
          users.map(u =>
            u.id === id
              ? {
                  ...u,
                  firstName: updatedUser.firstName,
                  lastName: updatedUser.lastName,
                  role: updatedUser.role,
                  isActive: data.isActive ?? u.isActive,
                }
              : u
          )
        );
      })
    );
  }

  resetPassword(id: number, data: AdminResetPasswordRequest): Observable<{ success: boolean }> {
    return this.api.post<{ success: boolean }>(`/users/admin/${id}/reset-password`, data);
  }

  toggleUserActive(id: number): Observable<{ success: boolean }> {
    return this.api.put<{ success: boolean }>(`/users/admin/${id}/toggle-active`).pipe(
      tap(() => {
        this.users.update(users => users.map(u => (u.id === id ? { ...u, isActive: !u.isActive } : u)));
      })
    );
  }

  deleteUser(id: number): Observable<{ success: boolean }> {
    return this.api.delete<{ success: boolean }>(`/users/admin/${id}`).pipe(
      tap(() => {
        this.users.update(users => users.filter(u => u.id !== id));
      })
    );
  }
}
