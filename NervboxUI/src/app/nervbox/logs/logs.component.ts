import { Component, OnDestroy } from '@angular/core';
import { NbThemeService } from '@nebular/theme';
import { takeWhile } from 'rxjs/operators/takeWhile';

@Component({
  selector: 'nervbox-logs',
  styleUrls: ['./logs.component.scss'],
  templateUrl: './logs.component.html',
})
export class LogsComponent implements OnDestroy {

  public tabs = [
    {
      title: 'System',
      route: '/nervbox/logs/system',
    },
  ];

  constructor(private themeService: NbThemeService) { }

  ngOnDestroy() { }
}
