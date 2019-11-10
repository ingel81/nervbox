import { Injectable } from '@angular/core';
import { HttpClient, HttpRequest, HttpHeaders, HttpErrorResponse, HttpParams, HttpEvent } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { environment } from '../../../environments/environment';

const httpOptions = {
    headers: new HttpHeaders({
        'Content-Type': 'application/json'
    })
};

export interface IVersionInfo {
    daemonVersion: string;
    svnRevision: string;
    svnDate: string;
    svnAuthor: string;
}

export interface ISystemInfo {
    version: IVersionInfo;
}

@Injectable()
export class SystemService {
    constructor(private http: HttpClient) {

    }

    configureNetwork(): Observable<any> {
        return this.http.post<any>(environment.apiUrl + '/system/configureNetwork', null);
    }

    scanWifiNetworks(): Observable<any> {
        return this.http.post<any>(environment.apiUrl + '/system/scanWifi', null);
    }

    reboot(): Observable<any> {
        return this.http.post<any>(environment.apiUrl + '/system/reboot', null);
    }

    getSystemLogs(): Observable<any> {
        return this.http.get<any>(environment.apiUrl + '/system/systemlog');
    }

    getSystemInfo(): Observable<ISystemInfo> {
        return this.http.get<ISystemInfo>(environment.apiUrl + '/system/info');
    }

    getChangeLog(): Observable<any> {
        return this.http.get<any>(environment.apiUrl + '/system/changelog');
    }

    uploadUpdate(form: FormData): Observable<HttpEvent<any>> {

        const uploadReq = new HttpRequest('POST', environment.apiUrl + '/system/uploadUpdate', form, {
            reportProgress: true,
        });

        return this.http.request<HttpEvent<any>>(uploadReq);
    }

    getDate(): Observable<any> {
        return this.http.get<any>(environment.apiUrl + '/system/date');
    }

    setDate(newDate: any): Observable<any> {
        return this.http.put<any>(environment.apiUrl + '/system/date', { newDate: newDate });
    }
}
