import { NgModule } from '@angular/core';

import { NbTooltipModule, NbButtonModule, NbPopoverModule } from '@nebular/theme';
import { ThemeModule } from '../../@theme/theme.module';
import { VersionComponent } from './version.component';
import { RouterModule } from '@angular/router';

@NgModule({
  imports: [
    ThemeModule,
    NbTooltipModule,
    NbPopoverModule,
    NbButtonModule,
    RouterModule,
  ],
  declarations: [
    VersionComponent,
  ],
  entryComponents: [

  ],
  providers: [

  ]
})
export class VersionModule { }
