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

export interface IChatMessage {
  message: string;
  date: Date;
  type: string;
  reply: boolean;
  username: string;
  userId: number;
}

@Injectable()
export class ChatService {


  public OnNewChatMessage: Observable<IChatMessage>;
  private _onNewChatMessage: Subject<IChatMessage>;

  private hubConnection: HubConnection;

  constructor(private http: HttpClient) {
    this.initWebSocket();

    this._onNewChatMessage = new Subject<IChatMessage>();
    this.OnNewChatMessage = this._onNewChatMessage.asObservable();
  }

  initWebSocket(): void {
    this.hubConnection = new HubConnectionBuilder()
      .withUrl(environment.signalrChatUrl, HttpTransportType.WebSockets)
      .configureLogging(LogLevel.Trace)
      .build();

    this.hubConnection.serverTimeoutInMilliseconds = 5000000;

    this.hubConnection.on('message', (msg: IChatMessage) => {
      this._onNewChatMessage.next(msg);
    });

    this.hubConnection.onclose(error => {
      setTimeout(() => { this.initWebSocket(); }, 5000);
    });

    this.hubConnection.start().then(() => {
    }).catch(error => {
      setTimeout(() => { this.initWebSocket(); }, 5000);
    });
  }

  sendMessage(msg: IChatMessage): void {
    this.hubConnection.send('sendMessage', msg).then(res => { }, err => { });
  }
}
