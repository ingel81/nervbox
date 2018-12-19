/**
 * @license
 * Copyright Akveo. All Rights Reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

//fix für webSocket problem:  https://github.com/aspnet/SignalR/issues/2389
Object.defineProperty(WebSocket, 'OPEN', { value: 1, });
//TODO: herausfinden welche Lib das falsch macht 

import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.error(err));
