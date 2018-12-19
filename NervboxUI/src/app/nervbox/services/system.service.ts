import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { environment } from '../../../environments/environment';

const httpOptions = {
    headers: new HttpHeaders({
        'Content-Type': 'application/json'
    })
};

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

}
