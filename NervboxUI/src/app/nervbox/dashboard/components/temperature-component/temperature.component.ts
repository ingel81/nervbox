import { Component, OnDestroy } from '@angular/core';
import { NbThemeService } from '@nebular/theme';

export interface IValueMode {
    aggregationType: string;
    metric: string;
    displayName: string;
}

@Component({
    selector: 'nervbox-temperature',
    styleUrls: ['./temperature.component.scss'],
    templateUrl: './temperature.component.html',
})
export class TemperatureComponent implements OnDestroy {

    mode = 'last hour';
    modes = ['last 5 minutes', 'last 15 minutes', 'last 30 minutes', 'last hour', 'last 24h', 'last 7 days', 'last 30 days', 'last 365 days'];

    valueModes: IValueMode[] = [
        {
            displayName: "Anzahl (Sounds)",
            aggregationType: "count",
            metric: "soundhash"
        },
        // {
        //     displayName: "Temperature 1 MAX [°C]",
        //     aggregationType: "max",
        //     metric: "temp_1"
        // },
        // {
        //     displayName: "Temperature 1 MIN [°C]",
        //     aggregationType: "min",
        //     metric: "temp_1"
        // },
    ];

    valueMode: IValueMode = this.valueModes[0];

    currentTheme: string;
    themeSubscription: any;

    constructor(private themeService: NbThemeService) {
        this.themeSubscription = this.themeService.getJsTheme().subscribe(theme => {
            this.currentTheme = theme.name;
        });
    }

    ngOnDestroy() {
        this.themeSubscription.unsubscribe();
    }
}
