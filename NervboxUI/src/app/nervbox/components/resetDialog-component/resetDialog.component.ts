import { Component, OnInit } from '@angular/core';
import { NbDialogRef } from '@nebular/theme';
import { FormGroup, FormBuilder, Validators, AbstractControl } from '@angular/forms';

@Component({
    selector: 'reset',
    templateUrl: 'resetDialog.component.html',
    styleUrls: ['./resetDialog.component.scss'],

})
export class ResetDialogComponent implements OnInit {

    resetForm: FormGroup;

    public title: string;
    public message: string;
    public inputRequired: boolean;

    public inputName: string;
    public inputComment: string;

    constructor(
        private formBuilder: FormBuilder,
        protected dialogRef: NbDialogRef<{ inputName: string, inputComment: string }>) {
    }

    ngOnInit(): void {
        if (this.inputRequired === true) {
            this.resetForm = this.formBuilder.group({
                name: ['', Validators.required],
                comment: ['', Validators.required],
            });
        } else {
            this.resetForm = this.formBuilder.group({});
        }
    }

    get f(): { [key: string]: AbstractControl } { return this.resetForm.controls; }

    cancel() {
        this.dialogRef.close(null);
    }

    submit() {

        if (this.inputRequired === true) {
            this.dialogRef.close({ inputName: this.f['name'].value, inputComment: this.f['comment'].value });
        } else {
            this.dialogRef.close();
        }
    }
}
