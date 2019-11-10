import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { NervboxAuthRoutingModule } from './auth-routing.module';
import { NbAuthModule } from '@nebular/auth';
import {
    NbAlertModule,
    NbButtonModule,
    NbCheckboxModule,
    NbInputModule
} from '@nebular/theme';

import { NervboxLoginComponent } from './login/login.component'; // <---

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        RouterModule,
        NbAlertModule,
        NbInputModule,
        NbButtonModule,
        NbCheckboxModule,
        NervboxAuthRoutingModule,

        NbAuthModule,
    ],
    declarations: [
        NervboxLoginComponent,
    ],
})
export class NervboxAuthModule {
}