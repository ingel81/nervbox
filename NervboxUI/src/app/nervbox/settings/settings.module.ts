import { NgModule } from '@angular/core';

import { NbListModule } from '@nebular/theme';

import { NgxEchartsModule } from 'ngx-echarts';
import { ThemeModule } from '../../@theme/theme.module';
import { SettingsComponent } from './settings.component';
import { SettingComponent } from './setting-component/setting.component';
import { TextMaskModule } from 'angular2-text-mask';
import { LanSettingsComponent } from './lan-settings-component/lanSettings.component';
import { WifiPickerComponent } from './lan-settings-component/wifi-picker-component/wifiPicker.component';

import { NbDialogModule } from '@nebular/theme';

@NgModule({
  imports: [
    ThemeModule,
    NgxEchartsModule,
    NbListModule,
    TextMaskModule,
    NbDialogModule.forChild()
  ],
  declarations: [
    SettingsComponent,
    SettingComponent,
    LanSettingsComponent,
    WifiPickerComponent,
  ],
  entryComponents: [
    WifiPickerComponent
  ]
})
export class SettingsModule { }
