import { NgModule, ModuleWithProviders } from '@angular/core';

import { NervboxComponent } from './nervbox.component';
import { DashboardModule } from './dashboard/dashboard.module';
import { SettingsModule } from './settings/settings.module';
import { LogsModule } from './logs/logs.module';
import { DebugModule } from './debug/debug.module';
import { NervboxRoutingModule } from './nervbox-routing.module';
import { ThemeModule } from '../@theme/theme.module';
import { MiscellaneousModule } from '../pages/miscellaneous/miscellaneous.module';

/* Services */
import { NervboxDataService } from './services/nervboxdata.service';
import { NervboxSettingsService } from './services/nervboxsettings.service';
import { SshService } from './services/ssh.service';
import { SystemService } from './services/system.service';
import { SoundService } from './services/sound.service';

const SERVICES = [
  NervboxDataService,
  NervboxSettingsService,
  SshService,
  SystemService,
  SoundService,
];

const NERVBOX_COMPONENTS = [
  NervboxComponent,
];

@NgModule({
  imports: [
    NervboxRoutingModule,
    ThemeModule,
    DashboardModule,
    LogsModule,
    MiscellaneousModule,
    SettingsModule,
    DebugModule,
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
