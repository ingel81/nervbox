import { Component } from '@angular/core';
import { environment } from '../../../../environments/environment'
import { SystemService, IVersionInfo, ISystemInfo } from '../../../nervbox/services/system.service';

@Component({
  selector: 'ngx-footer',
  styleUrls: ['./footer.component.scss'],
  template: `
  <span class="created-by">&copy; {{year}} | <b>CABD</b>
    
    &nbsp;|&nbsp;v.<span *ngIf="systemInfo" [routerLink]="['/nervbox/version']" [nbPopover]="systemInfoString" nbPopoverTrigger="hover" nbPopoverPlacement="top">{{guiVersion}}</span>
    
    </span>
  `,
})
export class FooterComponent {
  public year: number = new Date().getFullYear()
  public guiVersion: string = environment.version;
  public systemInfo: ISystemInfo = null;
  public systemInfoString: string = '';

  constructor(private systemService: SystemService) {
    this.systemService.getSystemInfo().subscribe((res) => {
      this.systemInfo = res;
      this.systemInfoString = "GUI: " + this.guiVersion + " | ";
      this.systemInfoString += "Deamon: " + this.systemInfo.version.daemonVersion + " | ";
      this.systemInfoString += "Date: " + this.systemInfo.version.svnDate + " | ";
      this.systemInfoString += "Revision: " + this.systemInfo.version.svnRevision;

    }, (err) => {

    });
  }

  showChangelog() {

    

    // this.systemService.getChangelog().subscribe(res => {
    //   this.changelog = res.changelog;
    // }, err => {

    // });
  }
}
