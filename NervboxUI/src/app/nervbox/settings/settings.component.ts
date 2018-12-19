import { Component, OnDestroy, OnInit } from '@angular/core';
import { NbThemeService } from '@nebular/theme';
import { takeWhile } from 'rxjs/operators/takeWhile';
import { NervboxSettingsService, ISetting, SettingScope } from '../services/nervboxsettings.service';

@Component({
  selector: 'nervbox-settings',
  styleUrls: ['./settings.component.scss'],
  templateUrl: './settings.component.html',
})

export class SettingsComponent implements OnDestroy, OnInit {

  public settings: ISetting[] = [];

  constructor(private themeService: NbThemeService, private settingsService: NervboxSettingsService) {

  }

  ngOnInit(): void {
    this.settingsService.getMultipleSettingsByScope(SettingScope.None).subscribe((settings: ISetting[]) => {
      this.settings = settings;
    });
  }

  ngOnDestroy() {

  }
}
