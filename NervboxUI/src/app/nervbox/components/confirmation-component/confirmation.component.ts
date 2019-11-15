import { Component } from '@angular/core';
import { NbDialogRef } from '@nebular/theme';

@Component({
    selector: 'confirmation',
    templateUrl: 'confirmation.component.html',
    styleUrls: ['./confirmation.component.scss'],

})
export class ConfirmationComponent {

    public title: string;
    public message: string;

    constructor(protected dialogRef: NbDialogRef<boolean>) {
    }

    cancel() {
        this.dialogRef.close();
    }

    submit() {
        this.dialogRef.close(true);
    }
}
