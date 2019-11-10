import { Component } from '@angular/core';
import { NbAccessChecker } from '@nebular/security';

import { MENU_ITEMS } from './nervbox-menu';

@Component({
  selector: 'ngx-nervbox',
  template: `
    <ngx-one-column-layout>
      <nb-menu [items]="menu"></nb-menu>
      <router-outlet></router-outlet>
    </ngx-one-column-layout>
  `,
})
export class NervboxComponent {

  menu = MENU_ITEMS;

  constructor(public accessChecker: NbAccessChecker) {

    //filter menu based on permissions
    MENU_ITEMS.forEach(element => {
      accessChecker.isGranted('view', element.permissionKey).subscribe(res => {
        if (res) {
          element.hidden = false;
        } else {
          element.hidden = true;
        }
      });
    });
  }
}
