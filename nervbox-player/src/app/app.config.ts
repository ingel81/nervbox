import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  importProvidersFrom,
  isDevMode,
} from '@angular/core';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, Routes } from '@angular/router';
import { MatDialogModule } from '@angular/material/dialog';
import { provideServiceWorker } from '@angular/service-worker';
import { jwtInterceptor } from './core/interceptors/jwt.interceptor';

export const routes: Routes = [];

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withXhr(), withInterceptors([jwtInterceptor])),
    provideAnimationsAsync(),
    provideRouter(routes),
    importProvidersFrom(MatDialogModule),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
