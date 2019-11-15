import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';

import { environment } from '../../../environments/environment';

const httpOptions = {
    headers: new HttpHeaders({
        'Content-Type': 'application/json',
    }),
};

export interface ISshCmdRequest {
    command: string;
    timeoutMs?: number;
}

export interface ISshHistoryEntry {
    message: string;
}

export interface ISshHistory {
    entries: Array<ISshHistoryEntry>;
}

@Injectable()
export class SshService {
    constructor(private http: HttpClient) {
    }

    executeSshCmd(cmd: ISshCmdRequest): Observable<any> {
        return this.http.post<any>(environment.apiUrl + '/ssh/sshcmdraw', cmd);
    }
}
