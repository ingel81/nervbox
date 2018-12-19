import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';

import { environment } from '../../../environments/environment';

const httpOptions = {
    headers: new HttpHeaders({
        'Content-Type': 'application/json'
    })
};

export interface ITimescaleQueryParameters {
    metric: string;
    bucketSize: number;
    bucketType: string;
    aggregation: string;
    limit: number;
}

@Injectable()
export class NervboxDataService {
    constructor(private http: HttpClient) {

    }

    private extractData(res: Response) {
        let body = res;
        return body || {};
    }

    getTimescaleValues(queryParams: ITimescaleQueryParameters): Observable<any> {
        return this.http.post(environment.apiUrl + '/timescale/genericQuery', queryParams).pipe(
            map(this.extractData));
    }
}
