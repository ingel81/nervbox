import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { environment } from '../../../environments/environment';


const httpOptions = {
    headers: new HttpHeaders({
        'Content-Type': 'application/json',
    }),
};

export interface ISimpleTimescaleQueryParameters {
    metric: string;
    bucketSize: number;
    bucketType: string;
    aggregation: string;
    range: string;
    limit: number;
    dataPointType: string;

}

export interface IGenericTimescaleQueryParameters {
    metrics: Array<{ metric: string, aggregation: string }>;
    bucketSize: number;
    bucketType: string;
    start?: any;
    end?: any;
    range: string;
    limit: number;
    dataPointType: string;
}

export interface IRecordQueryParameters {
    doCount: boolean;
    skip: number;
    size: number;
    start?: any;
    end?: any;
    range: string;
    exportCSV?: boolean;
}

export interface IDefaultQueryRange {
    key: QueryRangeKey;
    name: string;
}

export enum QueryRangeKey {
    CURRENTHOUR = 'CURRENTHOUR',
    CURRENTDAY = 'CURRENTDAY',
    CURRENTWEEK = 'CURRENTWEEK',
    CURRENTMONTH = 'CURRENTMONTH',
    CURRENTYEAR = 'CURRENTYEAR',
    LIVE = 'LIVE',
    LAST60MINUTES = 'LAST60MINUTES',
    LAST24HOURS = 'LAST24HOURS',
    LAST7DAYS = 'LAST7DAYS',
    LAST30DAYS = 'LAST30DAYS',
    LAST365DAYS = 'LAST365DAYS',
    CUSTOM = 'CUSTOM',
}

export interface IMetricType {
    aggregationType: string;
    metricKey: string;
    displayName: string;
    unitDisplayName: string;
}

@Injectable()
export class NervboxDataService {
    constructor(private http: HttpClient) {

    }

    private extractData(res: Response) {
        const body = res;
        return body || {};
    }

    getSimpleTimescaleValue(queryParams: ISimpleTimescaleQueryParameters): Observable<any> {
        return this.http.post(environment.apiUrl + '/timescale/simpleQuery', queryParams).pipe(
            map(this.extractData));
    }

    getGenericTimescaleValues(queryParams: IGenericTimescaleQueryParameters): Observable<any> {
        return this.http.post(environment.apiUrl + '/timescale/genericQuery', queryParams).pipe(
            map(this.extractData));
    }

    queryRecords(queryParams: IRecordQueryParameters): Observable<any> {
        return this.http.post(environment.apiUrl + '/records/query', queryParams).pipe(
            map(this.extractData));
    }

    deleteAllRecords(): Observable<{ rowsAffected: number }> {
        return this.http.delete<{ rowsAffected: number }>(environment.apiUrl + '/records');
    }

    deleteAllUsers(): Observable<{ rowsAffected: number }> {
        return this.http.delete<{ rowsAffected: number }>(environment.apiUrl + '/users');
    }

    getDefaultRanges(allowCurrent: boolean = false, allowCustom: boolean = false, allowLive: boolean = false): Array<IDefaultQueryRange> {

        const results = [];

        if (allowLive) {
            results.push(
                { key: QueryRangeKey.LIVE, name: 'Live Datenansicht' },
            );
        }

        results.push(
            { key: QueryRangeKey.LAST60MINUTES, name: 'Letzte 60 Minuten' },
            { key: QueryRangeKey.LAST24HOURS, name: 'Letzte 24 Stunden' },
            { key: QueryRangeKey.LAST7DAYS, name: 'Letzte 7 Tage' },
            { key: QueryRangeKey.LAST30DAYS, name: 'Letzte 30 Tage' },
            { key: QueryRangeKey.LAST365DAYS, name: 'Letzte 365 Tage' },
        );

        if (allowCurrent) {
            results.push(
                { key: QueryRangeKey.CURRENTHOUR, name: 'Aktuelle Stunde' },
                { key: QueryRangeKey.CURRENTDAY, name: 'Aktueller Tag' },
                { key: QueryRangeKey.CURRENTWEEK, name: 'Aktuelle Woche' },
                { key: QueryRangeKey.CURRENTMONTH, name: 'Aktueller Monat' },
                { key: QueryRangeKey.CURRENTYEAR, name: 'Aktuelles Jahr' },
            );
        }

        if (allowCustom) {
            results.push(
                { key: QueryRangeKey.CUSTOM, name: 'Benutzerdefiniert' },
            );
        }

        return results;
    }

}
