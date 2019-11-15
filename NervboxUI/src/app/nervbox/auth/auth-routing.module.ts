import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { NbAuthComponent, NbLogoutComponent } from '@nebular/auth';  // <---

import { NervboxLoginComponent } from './login/login.component'; // <---

export const routes: Routes = [
    {
        path: '',
        component: NbAuthComponent,  // <---
        children: [
            {
                path: 'login',
                component: NervboxLoginComponent, // <---
            },
            {
                path: 'logout',
                component: NbLogoutComponent, // <---
            },
        ],
    },
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule],
})
export class NervboxAuthRoutingModule {
}
