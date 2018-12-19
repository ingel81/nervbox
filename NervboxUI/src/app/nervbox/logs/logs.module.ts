import { NgModule } from '@angular/core';

import { NbListModule } from '@nebular/theme';
import { NgxEchartsModule } from 'ngx-echarts';
import { ThemeModule } from '../../@theme/theme.module';
import { LogsComponent } from './logs.component';

@NgModule({
  imports: [
    ThemeModule,
    NgxEchartsModule,
    NbListModule,
  ],
  declarations: [
    LogsComponent,
  ],
})
export class LogsModule { }
