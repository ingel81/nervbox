import { Component, OnInit, Input, ViewChild } from '@angular/core';
import { ISetting, NervboxSettingsService } from '../../services/nervboxsettings.service';
import { NgForm } from '@angular/forms';

@Component({
    selector: 'setting',
    templateUrl: './setting.component.html',
    styleUrls: ['./setting.component.scss'],
})

export class SettingComponent implements OnInit {

    @ViewChild('settingForm') public settingForm: NgForm;

    public doubleMask = "[-+]?\d*(.\d(\d*)?)?";
    public intMask = "[-+]?\d*";

    @Input()
    set setting(s: ISetting) {
        this.settingOriginal = s;
        this.settingEdit = Object.assign({}, s);
    }

    get setting(): ISetting { return this.settingOriginal; }

    public settingEdit: ISetting = null;

    private settingOriginal: ISetting = null;

    constructor(private nervboxSettingService: NervboxSettingsService) {

    }

    ngOnInit() { }

    updateSetting() {
        this.nervboxSettingService.updateSingleSetting(this.settingEdit).subscribe((response: ISetting) => {
            this.setting = response;
            this.settingForm.controls["value"].markAsPristine();
        });
    }

    revertChanges() {
        this.setting = Object.assign({}, this.settingOriginal);
        this.settingForm.controls["value"].markAsPristine();
    }

}