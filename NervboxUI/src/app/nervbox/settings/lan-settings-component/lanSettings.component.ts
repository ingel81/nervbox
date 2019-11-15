import { Component, OnInit, ViewChild } from '@angular/core';
import { NgForm } from '@angular/forms';
import { NervboxSettingsService, ISetting } from './../../services/nervboxsettings.service';
import { SystemService } from './../../services/system.service';
import { NbDialogService, NbToastrService, NbGlobalPhysicalPosition } from '@nebular/theme';
import { WifiPickerComponent } from './wifi-picker-component/wifiPicker.component';
import { RebootWaitComponent } from '../../components/rebootWait-component/rebootWait.component';
import { environment } from '../../../../environments/environment';
import { ConfirmationComponent } from '../../components/confirmation-component/confirmation.component';

export enum LanMode { On = 'On', Off = 'Off' }
export enum WifiMode { Off = 'Off', Client = 'Client', AccessPoint = 'Accesspoint' }

export interface INetworkSettings {
    lanMode: LanMode;
    lanSettings: ILanSettings;
    wifiMode: WifiMode;
    wifiSettings: IWifiSettings;
    accessPointSettings: IAccessPointSettings;
    ntpSettings: INtpSettings;
}

export interface ILanSettings {
    dhcp: boolean;
    ip: string;
    subnetMask: string;
    gateway: string;
    dns0: string;
    dns1: string;
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

export interface INtpSettings {
    ntp: string;
}

@Component({
    selector: 'lan-settings',
    templateUrl: './lanSettings.component.html',
    styleUrls: ['./lanSettings.component.scss'],
})
export class LanSettingsComponent implements OnInit {

    @ViewChild('lanSettingsForm', { static: false }) public lanSettingsForm: NgForm;

    public originalSettings: INetworkSettings = null;
    public networkSettings: INetworkSettings = null;

    private setting: ISetting = null;
    constructor(
        private settingsService: NervboxSettingsService,
        private systemService: SystemService,
        private dialogService: NbDialogService,
        private toastrService: NbToastrService,
    ) {

    }

    ngOnInit() {
        this.settingsService.getSingleSettingByKey('networkConfig').subscribe(res => {

            this.setting = res;
            this.networkSettings = JSON.parse(res.value);
            this.originalSettings = JSON.parse(res.value);

            if (!this.networkSettings.ntpSettings) {
                this.networkSettings.ntpSettings = {
                    ntp: null,
                };
            }

        }, err => {
            // TODO: toasting
        });
    }

    saveAndApplyNetworkSettings(): void {

        this.settingsService.updateSingleSetting({
            key: this.setting.key,
            value: JSON.stringify(this.networkSettings),
            description: this.setting.description,
            settingType: this.setting.settingType,
            settingScope: this.setting.settingScope,
        }).subscribe(res => {
            this.systemService.configureNetwork().subscribe(res => {

                // reboot waiting dialog
                this.dialogService.open(RebootWaitComponent, {
                    closeOnBackdropClick: false,
                    closeOnEsc: false,
                    hasBackdrop: true,
                    context: {
                        doPing: true,
                        title: 'Netzwerkeinstellungen werden angewendet. Gerät startet jetzt neu.',
                        message: 'Bitte warten...',
                        hint: 'Falls die IP-Adresse geändert wurde, ändern Sie bitte nun manuell die URL im Browser entsprechend ab und warten bis das Gerät wieder erreichbar ist.',
                        testUrl: environment.apiUrl.replace('/api', ''),
                    },
                },
                ).onClose.subscribe(res => {

                }, cancel => {

                });

            }, err => {
                this.toastrService.show(err.message, 'Error applying new network settings', {
                    status: 'danger',
                    duration: 0,
                    position: NbGlobalPhysicalPosition.BOTTOM_RIGHT,
                });
            });

        }, err => {
            this.toastrService.show(err.message, 'Error updating network settings', {
                status: 'danger',
                duration: 0,
                position: NbGlobalPhysicalPosition.BOTTOM_RIGHT,
            });
        });
    }

    pickWifi(): void {
        const affe = this.dialogService.open(WifiPickerComponent, {
            closeOnBackdropClick: false,
            closeOnEsc: true,
            hasBackdrop: true,
        },
        ).onClose.subscribe(res => {
            this.networkSettings.wifiSettings.ssid = res.essid;
        }, cancel => {

        });
    }
}

