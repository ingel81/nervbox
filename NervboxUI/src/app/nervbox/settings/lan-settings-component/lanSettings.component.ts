import { Component, OnInit, Input, ViewChild, AfterViewChecked, ElementRef } from '@angular/core';
import { NgForm } from '@angular/forms';
import { NervboxSettingsService, SettingScope, SettingType, ISetting } from './../../services/nervboxsettings.service';
import { SystemService } from './../../services/system.service';
import { NbDialogService } from '@nebular/theme';
import { WifiPickerComponent } from './wifi-picker-component/wifiPicker.component';

export enum LanMode { On = "On", Off = "Off" }
export enum WifiMode { Off = "Off", Client = "Client", AccessPoint = "Accesspoint" }

export interface INetworkSettings {
    lanMode: LanMode;
    lanSettings: ILanSettings;
    wifiMode: WifiMode;
    wifiSettings: IWifiSettings;
    accessPointSettings: IAccessPointSettings;
}

export interface ILanSettings {
    dhcp: boolean;
    ip: string;
    subnetMask: string,
    gateway: string;
    dns0: string;
    dns1: string
}

export interface IWifiSettings extends ILanSettings {
    ssid: string;
    psk: string;
}

export interface IAccessPointSettings extends ILanSettings {
    ssid: string;
    psk: string;
    rangeStart: string;
    rangeEnd: string;
    leaseHours: number;
    channel: number;
}



@Component({
    selector: 'lan-settings',
    templateUrl: './lanSettings.component.html',
    styleUrls: ['./lanSettings.component.scss'],
})
export class LanSettingsComponent implements OnInit {

    @ViewChild('lanSettingsForm') public lanSettingsForm: NgForm;

    public networkSettings: INetworkSettings = null;
    private setting: ISetting = null;
    constructor(private settingsService: NervboxSettingsService, private systemService: SystemService, private dialogService: NbDialogService) {

    }

    ngOnInit() {
        this.settingsService.getSingleSettingByKey("networkConfig").subscribe(res => {
            this.setting = res;
            this.networkSettings = JSON.parse(res.value);
        }, err => {

        });
    }

    ngAfterViewChecked() {

    }

    saveAndApplyNetworkSettings(): void {
        debugger;
        this.settingsService.updateSingleSetting({
            key: this.setting.key,
            value: JSON.stringify(this.networkSettings),
            description: this.setting.description,
            settingType: this.setting.settingType,
            settingScope: this.setting.settingScope
        }).subscribe(res => {
            debugger;
            this.systemService.configureNetwork().subscribe(res => {
                debugger;
            }, err => {
                debugger;
            });

        }, err => {
            debugger;
        });
    }

    pickWifi(): void {
        var affe = this.dialogService.open(WifiPickerComponent, {
            closeOnBackdropClick: false,
            closeOnEsc: true,
            hasBackdrop: true
        }
        ).onClose.subscribe(res => {
            this.networkSettings.wifiSettings.ssid = res.essid;
        });
    }
}

