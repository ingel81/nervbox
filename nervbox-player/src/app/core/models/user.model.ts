export interface User {
  id: number;
  username: string;
  firstName?: string;
  lastName?: string;
  role: string;
  createdAt?: string;
  token?: string;
  avatarUrl?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  confirmPassword: string;
  firstname?: string;
  lastname?: string;
  terms: boolean;
}

export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword1: string;
  newPassword2: string;
}

export interface TopUser {
  playedById: number;
  name: string;
  count: number;
}

// Admin models
export interface UserAdmin {
  id: number;
  username: string;
  firstName?: string;
  lastName?: string;
  ipAddress: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface AdminCreateUserRequest {
  username: string;
  password: string;
  firstName?: string;
  lastName?: string;
  role?: string;
}

export interface AdminUpdateUserRequest {
  firstName?: string;
  lastName?: string;
  role?: string;
  isActive?: boolean;
}

export interface AdminResetPasswordRequest {
  newPassword: string;
}
