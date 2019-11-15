import { Component, OnDestroy, OnInit } from '@angular/core';
import { SystemService } from '../services/system.service';

@Component({
  selector: 'nervbox-version',
  styleUrls: ['./version.component.scss'],
  templateUrl: './version.component.html',
})
export class VersionComponent implements OnDestroy, OnInit {

  public changeLog: string = null;

  constructor(private systemService: SystemService) { }

  ngOnInit(): void {
    this.systemService.getChangeLog().subscribe(response => {
      this.changeLog = response.changeLog;
    }, err => {

    });
  }

  ngOnDestroy() {

  }
}
