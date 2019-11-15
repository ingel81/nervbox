import { Component, OnInit } from '@angular/core';
import { NbDialogRef } from '@nebular/theme';
import { SystemService } from '../../services/system.service';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { ISystemInfo } from '../../services/system.service';
import { HttpResponse } from '@aspnet/signalr';

@Component({
    selector: 'reboot-wait',
    templateUrl: 'rebootWait.component.html',
    styleUrls: ['./rebootWait.component.scss'],
})
export class RebootWaitComponent implements OnInit {

    public title: string;
    public message: string;
    public hint: string;
    public testUrl: string;
    public doPing: boolean;
    public offDetected: boolean;
    public rebootFinished: boolean;
    public goodCounter: number = 0;


    constructor(
        protected dialogRef: NbDialogRef<RebootWaitComponent>,
        private systemService: SystemService,
        private http: HttpClient) {
    }

    ngOnInit() {
        console.log('rebootWaitComponent onInit');

        this.rebootFinished = false;
        this.goodCounter = 0;

        if (this.doPing) {
            this.ping();
        }
    }

    ping() {
        console.log('pingFunc');
        this.getSystemInfo().subscribe((res: any) => {
            if (this.offDetected === true && res.status === 200) {
                this.goodCounter++;

                if (this.goodCounter > 5) {
                    console.log('finished! online again.');
                    this.rebootFinished = true;
                    this.dialogRef.close(true);
                    window.location.reload();
                } else {
                    console.log('ping again..prevent false nginxpositives.');
                    setTimeout(() => { this.ping(); }, 1000);
                    return;
                }
            } else {
                console.log('still online...');
                setTimeout(() => { this.ping(); }, 5000);
            }

        }, err => {
            this.offDetected = true;
            console.log('error', err);
            setTimeout(() => { this.ping(); }, 5000);
        });
    }

    getSystemInfo(): Observable<any> {
        return this.http.get(this.testUrl, { observe: 'response', responseType: 'text' });
    }
}
