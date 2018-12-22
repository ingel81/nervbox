import { Component, OnDestroy, Input, SimpleChanges, OnChanges } from '@angular/core';
import { NbThemeService } from '@nebular/theme';
import { SoundService } from '../../../services/sound.service';

export interface IStatisticsType {
    displayName: string;
    statisticsType: StatisticsType;
}

export enum StatisticsType { TOPUSER = "TOPUSER", TOPSOUND = "TOPSOUND" }

@Component({
    selector: 'nervbox-statistics',
    styleUrls: ['./statistics.component.scss'],
    templateUrl: './statistics.component.html',
})
export class StatisticsComponent implements OnDestroy, OnChanges {

    @Input() mode: number;

    public topUsers: [{ name: string, count: number }]
    public topSounds: [{ name: string, count: number, hash: string }]

    statisticTypes: IStatisticsType[] = [
        {
            displayName: "Top Users",
            statisticsType: StatisticsType.TOPUSER
        },
        {
            displayName: "Top Sounds",
            statisticsType: StatisticsType.TOPSOUND
        }
    ];

    currentStatisticsType: IStatisticsType = null;

    currentTheme: string;
    themeSubscription: any;

    constructor(private themeService: NbThemeService, private soundService: SoundService) {
        this.themeSubscription = this.themeService.getJsTheme().subscribe(theme => {
            this.currentTheme = theme.name;
        });

        //this.showStatistics();
    }

    ngOnDestroy() {
        this.themeSubscription.unsubscribe();
    }

    ngOnChanges(changes: SimpleChanges) {
        this.showStatistics(this.statisticTypes[this.mode]);
      }    

    playSound(soundHash): void {
        this.soundService.playSound(soundHash).subscribe(res => { });
    }

    showStatistics(statistics: IStatisticsType): void {

        this.currentStatisticsType = statistics;

        switch (this.currentStatisticsType.statisticsType) {
            case StatisticsType.TOPUSER:
                this.soundService.getTopUsers().subscribe(res => {
                    this.topUsers = res;
                });
                break;

            case StatisticsType.TOPSOUND:
                this.soundService.getTopSounds().subscribe(res => {
                    this.topSounds = res;
                });
                break;
        }
    }

}
