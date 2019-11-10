import { NgModule } from '@angular/core';

import { NbListModule, NbBadgeModule, NbTabsetModule, NbRouteTabsetModule, NbAccordionModule, } from '@nebular/theme';

import { NgxEchartsModule } from 'ngx-echarts';
import { ThemeModule } from '../../@theme/theme.module';
import { LogsComponent } from './logs.component';
import { SystemLogComponent } from './system-log/systemLog.component';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

@NgModule({
  imports: [
    ThemeModule,
    NgxEchartsModule,
    NbListModule,
    NbBadgeModule,
    NbTabsetModule,
    NbRouteTabsetModule,
    NbAccordionModule,
    NgbModule
  ],
  declarations: [
    LogsComponent,
    SystemLogComponent,
  ],
})
export class LogsModule { }
