import { Component } from '@angular/core';
import { NbDialogRef } from '@nebular/theme';
import { SystemService } from '../../../services/system.service';

@Component({
    selector: 'wifi-picker',
    templateUrl: 'wifiPicker.component.html',
    styleUrls: ['./wifiPicker.component.scss'],

})
export class WifiPickerComponent {

    public networks: Array<any>;
    public selected: any;

    constructor(protected dialogRef: NbDialogRef<WifiPickerComponent>, private systemService: SystemService) {
        this.systemService.scanWifiNetworks().subscribe(res => {
            this.networks = res;
        }, err => {

        });
    }

    cancel() {
        this.dialogRef.close();
    }

    submit() {
        this.dialogRef.close(this.selected);
    }
}