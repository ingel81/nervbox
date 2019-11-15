import { Component, OnDestroy } from '@angular/core';
import { takeWhile } from 'rxjs/operators/takeWhile';

import { Subscription } from 'rxjs';

import { version } from '../../../../../version';

@Component({
    selector: 'alert',
    styleUrls: ['./alert.component.scss'],
    templateUrl: './alert.component.html',
})
export class AlertComponent implements OnDestroy {

    private subscribers: Subscription[] = [];

    closedWarnings: { [key: string]: boolean } = {};
    public version: any = version;

    constructor() {    }

    ngOnDestroy() {
        this.subscribers.forEach(item => {
            item.unsubscribe();
        });
    }

    onCloseWarning(key: string) {
        this.closedWarnings[key] = true;
    }
}
