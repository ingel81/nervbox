import { Component } from '@angular/core';

import { MENU_ITEMS } from './nervbox-menu';

@Component({
  selector: 'ngx-nervbox',
  template: `
    <ngx-sample-layout>
      <nb-menu [items]="menu"></nb-menu>
      <router-outlet></router-outlet>
    </ngx-sample-layout>
  `,
})
export class NervboxComponent {

  menu = MENU_ITEMS;
}
