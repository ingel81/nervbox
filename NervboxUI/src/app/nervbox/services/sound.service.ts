import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, Subject } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { HubConnection, HubConnectionBuilder, LogLevel, HttpTransportType } from '@aspnet/signalr';

import { environment } from '../../../environments/environment';

const httpOptions = {
    headers: new HttpHeaders({
        'Content-Type': 'application/json',
    }),
};

export interface ISoundPlayed {
    initiator: {
        name: string;
        id: number;
    };
    time: Date;
    soundHash: string;
    fileName: string;
}

export interface ISound {
    hash: string;
    fileName: string;
    allowed: boolean;
    valid: boolean;
    active: boolean;
    size: number;
    played: number;
    duration: number;
}

@Injectable()
export class SoundService {


    public OnSoundPlayed : Observable<ISoundPlayed>;
    private _onSoundPlayed : Subject<ISoundPlayed>;

    private hubConnection: HubConnection;


    constructor(private http: HttpClient) {
        this.initWebSocket();

        this._onSoundPlayed = new Subject<ISoundPlayed>();
        this.OnSoundPlayed = this._onSoundPlayed.asObservable()
    }

    getSounds(): Observable<Array<ISound>> {
        return this.http.get<Array<ISound>>(environment.apiUrl + '/sound');
    }

    playSound(soundId: string): Observable<any> {
        return this.http.get<any>(environment.apiUrl + '/sound/' + soundId + '/play');
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

    initWebSocket(): void {
        this.hubConnection = new HubConnectionBuilder()
            .withUrl(environment.signalrSoundUrl, HttpTransportType.WebSockets)
            .configureLogging(LogLevel.Trace)
            .build();

        this.hubConnection.serverTimeoutInMilliseconds = 5000000;

        this.hubConnection.on('soundPlayed', (sound: ISoundPlayed) => {            
            this._onSoundPlayed.next(sound);
        });

        this.hubConnection.onclose(error => {
            setTimeout(() => { this.initWebSocket(); }, 5000);
        });

        this.hubConnection.start().then(() => {
        }).catch(error => {
            setTimeout(() => { this.initWebSocket(); }, 5000);
        });
    }    


}
