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
import { MAT_TOOLTIP_DEFAULT_OPTIONS, MatTooltipDefaultOptions } from '@angular/material/tooltip';
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
    // Touch: Tooltips aus. Material setzt sonst touch-action:none auf jedes Tooltip-Element
    // (z. B. Pad-Name) – Wischen dort scrollt dann nicht.
    {
      provide: MAT_TOOLTIP_DEFAULT_OPTIONS,
      useValue: {
        showDelay: 0,
        hideDelay: 0,
        touchendHideDelay: 1500,
        touchGestures: 'off',
      } satisfies MatTooltipDefaultOptions,
    },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
