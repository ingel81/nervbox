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

export interface ISound{
    hash: string;
    fileName: string;
    allowed: boolean;
    valid: boolean;
    active: boolean;
}

@Injectable()
export class SoundService {
    constructor(private http: HttpClient) {

    }

    getSounds(): Observable<Array<ISound>> {
        return this.http.get<Array<ISound>>(environment.apiUrl + '/sound');
    }

    playSound(soundId: string): Observable<any> {
        return this.http.get<any>(environment.apiUrl + '/sound/' + soundId+ '/play');
    }

    getTopUsers(): Observable<any> {
        return this.http.get(environment.apiUrl + '/sound/statistics/topusers');
    }

    getTopSounds(): Observable<any> {
        return this.http.get(environment.apiUrl + '/sound/statistics/topsounds');
    }

    killAllSounds(): Observable<any> {
        return this.http.get(environment.apiUrl + '/sound/killAll');
    }


}
