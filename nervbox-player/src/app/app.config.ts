import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  importProvidersFrom,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, Routes } from '@angular/router';
import { MatDialogModule } from '@angular/material/dialog';
import { jwtInterceptor } from './core/interceptors/jwt.interceptor';

export const routes: Routes = [
  {
    path: 'dev/td',
    loadComponent: () =>
      import('./components/mini-games/games/tower-defense/tower-defense.component').then(
        (m) => m.TowerDefenseComponent
      ),
  },
];

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([jwtInterceptor])),
    provideAnimationsAsync(),
    provideRouter(routes),
    importProvidersFrom(MatDialogModule),
  ],
};
