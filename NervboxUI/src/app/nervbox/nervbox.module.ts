import { NgModule, ModuleWithProviders } from '@angular/core';

import { NervboxComponent } from './nervbox.component';
import { DashboardModule } from './dashboard/dashboard.module';
import { SettingsModule } from './settings/settings.module';
import { LogsModule } from './logs/logs.module';
import { DebugModule } from './debug/debug.module';
import { NervboxRoutingModule } from './nervbox-routing.module';
import { ThemeModule } from '../@theme/theme.module';

/* Services */
import { NervboxDataService } from './services/nervboxdata.service';
import { NervboxSettingsService } from './services/nervboxsettings.service';
import { SshService } from './services/ssh.service';
import { SystemService } from './services/system.service';

/* Base components / Dialogs / Etc */
import { ConfirmationComponent } from './components/confirmation-component/confirmation.component';
import { RebootWaitComponent } from './components/rebootWait-component/rebootWait.component';
import { UserSettingsComponent } from './components/userSettings-component/userSettings.component';
import { ResetDialogComponent } from './components/resetDialog-component/resetDialog.component';
import { NbRouteTabsetModule, NbMenuModule, NbCardModule, NbProgressBarModule, NbSpinnerModule, NbSidebarModule, NbToastrModule, NbButtonModule } from '@nebular/theme';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { GreatherThanValidator } from './helpers/greather-than.validator.directive';
import { VersionModule } from './version/version.module';
import { SoundService } from './services/sound.service';
import { CamService } from './services/cam.service';

const SERVICES = [
  NervboxDataService,
  NervboxSettingsService,
  SshService,
  SoundService,
  CamService,
];

const NERVBOX_COMPONENTS = [
  NervboxComponent,
  ConfirmationComponent,
  RebootWaitComponent,
  UserSettingsComponent,
  ResetDialogComponent,
];

@NgModule({
  imports: [
    NbMenuModule.forRoot(),
    NervboxRoutingModule,
    ThemeModule,
    DashboardModule,
    LogsModule,
    SettingsModule,
    VersionModule,
    DebugModule,
    NbRouteTabsetModule,
    NbCardModule,
    NbProgressBarModule,
    NbSpinnerModule,
    NbSidebarModule.forRoot(),
    NbToastrModule.forRoot(),
    NbButtonModule,
    FormsModule,
    ReactiveFormsModule,
  ],
  declarations: [
    ...NERVBOX_COMPONENTS,
  ],
  providers: [
    ...SERVICES,
  ],
})
export class NervboxModule {
  static forRoot(): ModuleWithProviders {
    return <ModuleWithProviders>{
      ngModule: NervboxModule,
      providers: [
        ...SERVICES,
      ],
    };
  }
}
