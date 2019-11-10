import { Component, OnDestroy, OnInit } from '@angular/core';
import { NbThemeService, NbToastrService } from '@nebular/theme';
import { takeWhile } from 'rxjs/operators/takeWhile';
import { NervboxSettingsService, ISetting, SettingScope } from '../../services/nervboxsettings.service';
import { FormBuilder, FormGroup, Validators, AbstractControl } from '@angular/forms';

// import custom validator to validate that password and confirm password fields match
import { MustMatch } from '../../helpers/must-match.validator';
import { Router } from '@angular/router';
import { timeout } from 'rxjs/operators';
//import { NbToastStatus } from '@nebular/theme/components/toastr/model';

@Component({
  selector: 'user-settings',
  styleUrls: ['./userSettings.component.scss'],
  templateUrl: './userSettings.component.html',
})

export class UserSettingsComponent implements OnDestroy, OnInit {

  userSettingsForm: FormGroup;
  submitted = false;
  error = null;

  constructor(
    private themeService: NbThemeService,
    private settingsService: NervboxSettingsService,
    private formBuilder: FormBuilder,
    private toastrService: NbToastrService,
    private router: Router

  ) { }

  ngOnInit(): void {

    this.userSettingsForm = this.formBuilder.group({
      oldPassword: ['', Validators.required],
      newPassword1: ['', Validators.required],
      newPassword2: ['', Validators.required],
    }, {
        validator: MustMatch('newPassword1', 'newPassword2')
      });
  }

  get f(): { [key: string]: AbstractControl } { return this.userSettingsForm.controls; }

  ngOnDestroy() { }

  saveAndApplyUserSettings(): void {

    this.submitted = true;

    // stop here if form is invalid
    if (this.userSettingsForm.invalid) {
      return;
    }

    this.settingsService.updateUserPassword(this.userSettingsForm.value).subscribe(res => {
      if (!res.success) {
        this.error = res.error;
      } else {
        this.toastrService.show("Bitte erneut anmelden...", "Passwort erfolgreich geändert", { status: "info" });

        setTimeout(() => {
          this.router.navigateByUrl("/auth/logout");
        }, 5000);
      }
    });
  }

}
