import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import { INetworkSettings } from '../settings/lan-settings-component/lanSettings.component';

const httpOptions = {
    headers: new HttpHeaders({
        'Content-Type': 'application/json',
    }),
};

export enum SettingType {
    Boolean = 'Boolean',
    String = 'String',
    Int = 'Int',
    Double = 'Double',
    JSON = 'JSON',
}

export enum SettingScope {
    None = 'None',
    General = 'General',
    System = 'System',
    Module = 'Module',
    Network = 'Network',
    Recording = 'Recording',
    ModuleFeatures = 'ModuleFeatures',
    HealthScore = 'HealthScore',
}

export interface ISetting {
    key: string;
    value: string;
    settingType: string;
    description: string;
    settingScope: SettingScope;
}

@Injectable()
export class NervboxSettingsService {
    constructor(private http: HttpClient) {

    }

    private extractData(res: Response) {
        const body = res;
        return body || {};
    }

    getMultipleSettingsByScope(scope: SettingScope): Observable<ISetting[]> {
        const params = new HttpParams().set('scope', scope);
        return this.http.get<ISetting[]>(environment.apiUrl + '/settings', { params: params });
    }

    getSingleSettingByKey(settingKey: string): Observable<ISetting> {
        const params = new HttpParams().set('key', settingKey);
        return this.http.get<ISetting>(environment.apiUrl + '/settings', { params: params });
    }

    updateSingleSetting(updateSetting: ISetting): Observable<ISetting> {
        return this.http.put<ISetting>(environment.apiUrl + '/settings/' + updateSetting.key, updateSetting);
    }

    updateMultipleSettings(updateSettings: Array<ISetting>): Observable<Array<ISetting>> {
        return this.http.put<Array<ISetting>>(environment.apiUrl + '/settings', updateSettings);
    }

    updateUserPassword(updateUserPassword: any): Observable<any> {
        return this.http.post(environment.apiUrl + '/users/changepassword', updateUserPassword);
    }

}
