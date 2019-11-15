import { Component, OnDestroy, OnInit } from '@angular/core';
import { NbThemeService } from '@nebular/theme';
import { takeWhile } from 'rxjs/operators/takeWhile';
import { SystemService } from '../../services/system.service';
import * as moment from 'moment';

@Component({
    selector: 'system-log',
    styleUrls: ['./systemLog.component.scss'],
    templateUrl: './systemLog.component.html',
})
export class SystemLogComponent implements OnDestroy, OnInit {

    public allLogs: Array<any>;
    public currentPageRecords: Array<any>;

    public loading: boolean = false;

    public totalCount: number;

    public pager: { maxSize: number, currentPage: number, pageSize: number } = { currentPage: 1, maxSize: 5, pageSize: 25 };

    constructor(private themeService: NbThemeService, private systemService: SystemService) {

    }

    momentToLocal(date: Date): Date {
        return moment.utc(date).local().toDate();
    }

    ngOnInit() {
        this.refreshLogs();
    }

    pageChanged(): void {
        const page = this.pager.currentPage;
        const skip = (page - 1) * this.pager.pageSize;
        this.currentPageRecords = this.allLogs.slice(skip, skip + this.pager.pageSize);
    }

    refreshLogs() {
        this.loading = true;

        this.systemService.getSystemLogs().subscribe(res => {
            this.allLogs = res.logs;
            this.totalCount = this.allLogs.length;
            this.pageChanged();
            this.loading = false;
        }, err => {
            this.totalCount = 0;
            this.loading = false;
        });
    }

    ngOnDestroy() {

    }
}
