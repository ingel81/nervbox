import { ExtraOptions, RouterModule, Routes } from '@angular/router';
import { NgModule } from '@angular/core';
import { AuthGuard } from './auth-guard.service';

import {
  NbAuthComponent,
  NbLoginComponent,
  NbLogoutComponent,
  NbRegisterComponent,
  NbRequestPasswordComponent,
  NbResetPasswordComponent,
} from '@nebular/auth';

const routes: Routes = [
  {
    path: 'nervbox',
    canActivate: [AuthGuard],
    loadChildren: 'app/nervbox/nervbox.module#NervboxModule'
  },
  {
    path: 'auth',
    loadChildren: './nervbox/auth/auth.module#NervboxAuthModule',
  },
  { path: '', redirectTo: 'nervbox', pathMatch: 'full' },
  { path: '**', redirectTo: 'nervbox' },
];

const config: ExtraOptions = {
  useHash: false,
  enableTracing: false,
};

@NgModule({
  imports: [RouterModule.forRoot(routes, config)],
  exports: [RouterModule],
})
export class AppRoutingModule {
}
