import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';

export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const snackBar = inject(MatSnackBar);
  const token = localStorage.getItem('nervbox_token');

  // Don't add token to auth endpoints
  if (token && !req.url.includes('/auth/')) {
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && token) {
        // Token is invalid - clear it and reload
        localStorage.removeItem('nervbox_token');
        snackBar.open('Session abgelaufen - bitte neu einloggen', 'OK', {
          duration: 5000,
        });
        window.location.reload();
      }
      return throwError(() => error);
    })
  );
};
