/**
 * @license
 * Copyright Akveo. All Rights Reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */
import { APP_BASE_HREF } from '@angular/common';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { NgModule } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { CoreModule } from './@core/core.module';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { ThemeModule } from './@theme/theme.module';
import { AuthGuard } from './auth-guard.service';
import { AuthGuard2 } from './auth-guard.service';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { NbAuthJWTInterceptor } from '@nebular/auth'
import { NbPasswordAuthStrategy, NbAuthModule, NbAuthJWTToken, NB_AUTH_TOKEN_INTERCEPTOR_FILTER } from '@nebular/auth';

import { environment } from '../environments/environment';

import { registerLocaleData } from '@angular/common';

import localeDe from '@angular/common/locales/de';
import localeDeExtra from '@angular/common/locales/extra/de';

import { RoleProvider } from './role.provider';
import { NbSecurityModule, NbRoleProvider } from '@nebular/security';

import { RolePermissions } from './app.permissions';

import { NbEvaIconsModule } from '@nebular/eva-icons';
import { SystemService } from './nervbox/services/system.service';

registerLocaleData(localeDe, 'de-DE', localeDeExtra);

//other modules added by CSP

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    HttpClientModule,
    AppRoutingModule,
    NgbModule,
    NbEvaIconsModule,
    ThemeModule.forRoot(),
    CoreModule.forRoot(),
    NbAuthModule.forRoot({
      strategies: [
        NbPasswordAuthStrategy.setup({
          name: 'email',
          token: {
            class: NbAuthJWTToken,
            key: 'token', // this parameter tells where to look for the token
          },
          baseEndpoint: environment.apiUrl,
          login: {
            endpoint: '/users/auth/login',
            method: 'post'
          },
          refreshToken: {
            endpoint: '/users/auth/refresh',
            method: 'post'
          },
          logout: {
            endpoint: '/users/auth/logout',
            method: 'delete',
            alwaysFail: false
          },
        }),
      ],
      forms: {
        login: {
          redirectDelay: 500, // delay before redirect after a successful login, while success message is shown to the user
          strategy: 'email',  // strategy id key.
          showMessages: {     // show/not show success/error messages
            success: true,
            error: true,
          },
        },
        logout: {
          redirectDelay: 500,
          strategy: 'email',
        },
        validation: {
          password: {
            required: true,
            minLength: 4,
            maxLength: 50,
          },
          email: {
            required: true,
          },
          fullName: {
            required: false,
            minLength: 4,
            maxLength: 50,
          },
        },

      },
    }),

    NbSecurityModule.forRoot(RolePermissions),
  ],
  bootstrap: [AppComponent],
  providers: [
    SystemService,
    { provide: APP_BASE_HREF, useValue: '/' },
    {
      provide: NB_AUTH_TOKEN_INTERCEPTOR_FILTER, useValue: (req) => {
        if (req.url.indexOf("users/auth/refresh") > -1) {
          //use no auth token on refresh endpoint
          return true;
        }

        return false;
      }
    }, //fix für Token sending: https://github.com/akveo/ngx-admin/issues/1871
    { provide: HTTP_INTERCEPTORS, useClass: NbAuthJWTInterceptor, multi: true },
    AuthGuard,
    AuthGuard2,
    { provide: NbRoleProvider, useClass: RoleProvider }
  ],
})
export class AppModule {
}
