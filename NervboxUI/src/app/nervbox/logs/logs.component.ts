import { Component, OnDestroy } from '@angular/core';
import { NbThemeService } from '@nebular/theme';
import { takeWhile } from 'rxjs/operators/takeWhile';

@Component({
  selector: 'nervbox-logs',
  styleUrls: ['./logs.component.scss'],
  templateUrl: './logs.component.html',
})
export class LogsComponent implements OnDestroy {

  constructor(private themeService: NbThemeService) {

  }

  ngOnDestroy() {

  }
}
