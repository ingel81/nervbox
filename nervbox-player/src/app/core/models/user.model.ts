export interface User {
  id: number;
  username: string;
  firstName?: string;
  lastName?: string;
  role: string;
  createdAt?: string;
  token?: string;
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
