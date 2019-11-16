import { Component, OnDestroy } from '@angular/core';
import { NbThemeService } from '@nebular/theme';
import { IDefaultQueryRange, NervboxDataService, QueryRangeKey, IMetricType } from '../../../services/nervboxdata.service';
import { SoundService } from '../../../services/sound.service';
import { ISetting } from '../../../services/nervboxsettings.service';
import { Subscription } from 'rxjs';

@Component({
    selector: 'nervbox-simple-chart-wrapper',
    styleUrls: ['./simpleChartWrapper.component.scss'],
    templateUrl: './simpleChartWrapper.component.html',
})
export class SimpleChartWrapperComponent implements OnDestroy {

    private subscribers: Subscription[] = [];

    public queryRanges: IDefaultQueryRange[] = this.nervboxDataService.getDefaultRanges(false, false, false);
    public queryRange: IDefaultQueryRange = this.queryRanges[0];

    public selectedDataPointOption : string = 'All';

    public metricModes: IMetricType[] = [];
    public allMetricModes: IMetricType[] = [
        {
            displayName: "Sounds gespielt",
            aggregationType: "count",
            metricKey: 'soundhash',
            unitDisplayName: "[Anzahl]"            
        },
    ];

    public metricMode: IMetricType = null;

    currentTheme: string;
    themeSubscription: any;

    public featuresDict: { [key: string]: ISetting }

    constructor(
        private themeService: NbThemeService,
        private nervboxDataService: NervboxDataService
    ) {
        this.subscribers.push(this.themeService.getJsTheme().subscribe(theme => {
            this.currentTheme = theme.name;
        }));
        
        this.setAvailableMetrics();
    }

    setAvailableMetrics() {
        this.metricModes = [];

        this.metricModes = this.allMetricModes;

        this.metricMode = this.metricModes[0];
        console.log("metricMode set");
    }

    ngOnDestroy() {
        this.subscribers.forEach(item => {
            item.unsubscribe();
        });
    }
}
