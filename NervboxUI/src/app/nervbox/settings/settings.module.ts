import { NgModule } from '@angular/core';

import { NbListModule, NbTabsetModule, NbRouteTabsetModule, NbCardModule, NbSpinnerModule, NbSelectModule, NbProgressBarModule } from '@nebular/theme';


import { NgxEchartsModule } from 'ngx-echarts';
import { ThemeModule } from '../../@theme/theme.module';
import { SettingsComponent } from './settings.component';
import { SettingComponent } from './setting-component/setting.component';
import { TextMaskModule } from 'angular2-text-mask';
import { LanSettingsComponent } from './lan-settings-component/lanSettings.component';
import { WifiPickerComponent } from './lan-settings-component/wifi-picker-component/wifiPicker.component';
import { NbDialogModule } from '@nebular/theme';
import { UpdateComponent } from './update/update.component';
import { RebootWaitComponent } from '../components/rebootWait-component/rebootWait.component';
import { FormsModule } from '@angular/forms';
import { GreatherThanValidator } from '../helpers/greather-than.validator.directive';


@NgModule({
  imports: [
    ThemeModule,
    NgxEchartsModule,
    NbListModule,
    TextMaskModule,
    NbTabsetModule,
    NbRouteTabsetModule,
    NbCardModule,
    NbDialogModule.forChild(),
    FormsModule,
    NbSelectModule,
    NbSpinnerModule,
    NbProgressBarModule
  ],
  declarations: [
    SettingsComponent,
    SettingComponent,
    LanSettingsComponent,
    WifiPickerComponent,
    UpdateComponent,
    GreatherThanValidator
  ],
  entryComponents: [
    WifiPickerComponent,
    RebootWaitComponent
  ]
})
export class SettingsModule { }
