import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { NgForm } from '@angular/forms';
import { NervboxSettingsService, SettingScope, SettingType, ISetting } from '../../services/nervboxsettings.service';
import { SystemService } from '../../services/system.service';
import { NbDialogService, NbToastrService, NbGlobalPhysicalPosition } from '@nebular/theme';
import { HttpEventType } from '@angular/common/http';
import { ConfirmationComponent } from '../../components/confirmation-component/confirmation.component';
import { RebootWaitComponent } from '../../components/rebootWait-component/rebootWait.component';
import { environment } from '../../../../environments/environment';

@Component({
    selector: 'update',
    templateUrl: './update.component.html',
    styleUrls: ['./update.component.scss'],
})
export class UpdateComponent implements OnInit {

    @ViewChild('updateForm', { static: false }) public updateForm: NgForm;
    @ViewChild('file', { static: false }) public fileInput: ElementRef;

    public progress: number = -1;
    public message: string = '';
    public uploading: boolean = false;
    public result: {
        valid: boolean,
        message: string,

    } = null;

    constructor(
        private systemService: SystemService,
        private dialogService: NbDialogService,
        private toastrService: NbToastrService,
    ) { }

    ngOnInit() {

    }

    ngAfterViewChecked() {

    }

    fileAdded(files: any) {

        if (files.length === 0)
            return;

        const formData = new FormData();

        for (const file of files)
            formData.append(file.name, file);

        // Dialog
        this.dialogService.open(ConfirmationComponent, {
            closeOnBackdropClick: false,
            closeOnEsc: true,
            hasBackdrop: true,
            context: { title: 'Software updaten?', message: 'Bitte bestätigen Sie, dass Sie dieses Softwareupdate hochladen und anwenden möchten. Das Gerät wird dabei neu gestartet.' },
        },
        ).onClose.subscribe(res => {

            if (res === true) {
                this.upload(formData);
            } else {
                console.log('upload canceled...');
                this.fileInput.nativeElement.value = '';
            }
        }, cancel => {

        });
    }

    upload(formData: FormData) {
        this.systemService.uploadUpdate(formData).subscribe(event => {
            console.log('event', event);

            if (event.type === HttpEventType.Sent) {
                this.uploading = true;
            }

            if (event.type === HttpEventType.UploadProgress) {
                this.progress = Math.round(100 * event.loaded / event.total);
            } else if (event.type === HttpEventType.Response) {
                this.result = event.body;

                if (this.result.valid === true) {

                    // reboot waiting dialog
                    this.dialogService.open(RebootWaitComponent, {
                        closeOnBackdropClick: false,
                        closeOnEsc: false,
                        hasBackdrop: true,
                        context: {
                            doPing: true,
                            title: 'Gerät wird neu gestartet',
                            message: 'Bitte warten...',
                            // testUrl: environment.apiUrl + "/system/info"
                            testUrl: environment.apiUrl.replace('/api', ''),
                        },
                    },
                    ).onClose.subscribe(res => {

                    }, cancel => {

                    });

                    // reboot
                    this.systemService.reboot().subscribe(res => {

                    }, err => {
                    });
                } else {
                    this.toastrService.show(event.body.message, 'Invalid update file', {
                        status: 'danger',
                        duration: 0,
                        position: NbGlobalPhysicalPosition.BOTTOM_RIGHT,
                    });

                    this.uploading = false;
                    this.progress = -1;
                }
            }

        }, error => {
            console.log('error', error);
            this.toastrService.show(error.body.message, 'Error uploading file', {
                status: 'danger',
                duration: 0,
                position: NbGlobalPhysicalPosition.BOTTOM_RIGHT,
            });

            this.uploading = false;
            this.progress = -1;
        });
    }

}
