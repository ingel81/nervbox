import { NgModule } from '@angular/core';

import { NbListModule, NbAlertModule, NbSelectModule, NbCardModule, NbTooltipModule, NbButtonModule, NbTabsetModule, NbPopoverModule } from '@nebular/theme';
import { NgxEchartsModule } from 'ngx-echarts';
import { ThemeModule } from '../../@theme/theme.module';
import { DashboardComponent } from './dashboard.component';
import { ConfirmationComponent } from '../components/confirmation-component/confirmation.component';
import { NbDialogModule } from '@nebular/theme';
import { AlertComponent } from './components/alert-component/alert.component';
import { RouterModule } from '@angular/router';
import { ResetDialogComponent } from '../components/resetDialog-component/resetDialog.component';
import { CallbackPipe } from '../components/callback-pipe/callback.pipe';
import { NbSecurityModule } from '@nebular/security';
import { NbAuthModule } from '@nebular/auth';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { PlaySoundComponent } from './components/play-sound-component/playSound.component';
import { SearchFilterPipe } from './components/search-filter/searchFilter.pipe';
import { OrderModule } from 'ngx-order-pipe';
import { NgbDropdownModule, NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { StatisticsComponent } from './components/statistics-component/statistics.component';
import { SimpleChartWrapperComponent } from './components/simpleChart-component/simpleChartWrapper.component';
import { SimpleChartComponent } from './components/simpleChart-component/simpleChart.component';

@NgModule({
  imports: [
    ThemeModule,
    FormsModule,
    NgxEchartsModule,
    NbListModule,
    NbAlertModule,
    NbSelectModule,
    NbTooltipModule,
    NbPopoverModule,
    NbButtonModule,
    NbSecurityModule,
    NbCardModule,
    NbTabsetModule,
    RouterModule,
    OrderModule,
    NbDialogModule.forChild(),
    NgbDropdownModule,
    NgbModule,
  ],
  declarations: [
    DashboardComponent,
    AlertComponent,
    CallbackPipe,
    PlaySoundComponent,
    SearchFilterPipe,
    StatisticsComponent,
    SimpleChartComponent,
    SimpleChartWrapperComponent,
  ],
  entryComponents: [
    ConfirmationComponent,
    ResetDialogComponent,
  ],
  providers: [
    DecimalPipe,
  ],
})
export class DashboardModule { }
