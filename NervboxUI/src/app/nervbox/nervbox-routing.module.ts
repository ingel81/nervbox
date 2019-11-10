import { RouterModule, Routes } from '@angular/router';
import { NgModule } from '@angular/core';

import { NervboxComponent } from './nervbox.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { SettingsComponent } from './settings/settings.component';

import { LogsComponent } from './logs/logs.component';
import { DebugComponent } from './debug/debug.component';
import { AuthGuard2 } from '../auth-guard.service';
import { SystemLogComponent } from './logs/system-log/systemLog.component'

import { SshComponent } from './debug/ssh-component/ssh.component';
import { LanSettingsComponent } from './settings/lan-settings-component/lanSettings.component';
import { UpdateComponent } from './settings/update/update.component';
import { UserSettingsComponent } from './components/userSettings-component/userSettings.component';
import { SpecialComponent } from './debug/special-component/special.component';
import { VersionComponent } from './version/version.component';

const routes: Routes = [{
  path: '',
  component: NervboxComponent,
  children: [
    {
      path: 'dashboard',
      component: DashboardComponent,
    },
    {
      path: 'logs',
      component: LogsComponent,

      children: [
        {
          path: 'system',
          component: SystemLogComponent,
        }
      ]
    },
    {
      path: 'settings',
      component: SettingsComponent,

      children: [
        {
          path: 'network',
          component: LanSettingsComponent,
        },
        {
          path: 'update',
          component: UpdateComponent,
        }
      ]

    },
    {
      path: 'usersettings',
      component: UserSettingsComponent
    },
    {
      path: 'debug',
      component: DebugComponent,

      children: [
        {
          path: 'ssh',
          component: SshComponent,
        },
        {
          path: 'special',
          component: SpecialComponent,
        },
      ]
    },
    {
      path: 'version',
      component: VersionComponent,
    },
    {
      path: '',
      redirectTo: 'dashboard',
      pathMatch: 'full',
    }
  ],
}];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class NervboxRoutingModule {
}
