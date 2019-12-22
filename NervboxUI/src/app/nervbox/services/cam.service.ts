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

@Injectable()
export class CamService {


  public OnNewImage: Observable<boolean>;
  private _onNewImage: Subject<boolean>;

  private hubConnection: HubConnection;

  constructor(private http: HttpClient) {
    this.initWebSocket();

    this._onNewImage = new Subject<boolean>();
    this.OnNewImage = this._onNewImage.asObservable();
  }

  getImage(): Observable<any> {
    return this.http.get<any>(environment.apiUrl + '/cam');
  }

  move(dir: string): Observable<any> {
    return this.http.get<any>(environment.apiUrl + '/cam/move/' + dir);
  }

  initWebSocket(): void {
    this.hubConnection = new HubConnectionBuilder()
      .withUrl(environment.signalrCamUrl, HttpTransportType.WebSockets)
      .configureLogging(LogLevel.Trace)
      .build();

    this.hubConnection.serverTimeoutInMilliseconds = 5000000;

    this.hubConnection.on('imageCaptured', (value: boolean) => {
      this._onNewImage.next(value);
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
