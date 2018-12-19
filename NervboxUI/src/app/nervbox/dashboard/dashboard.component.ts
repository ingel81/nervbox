import { Component, OnDestroy } from '@angular/core';
import { takeWhile } from 'rxjs/operators/takeWhile';

@Component({
  selector: 'nervbox-dashboard',
  styleUrls: ['./dashboard.component.scss'],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnDestroy {

  constructor() {

  }

  ngOnDestroy() {

  }
}
