import { Component, OnDestroy } from '@angular/core';
import { NbThemeService } from '@nebular/theme';

@Component({
    selector: 'nervbox-sensor',
    styleUrls: ['./sensor.component.scss'],
    templateUrl: './sensor.component.html',
})
export class SensorComponent implements OnDestroy {

    currentTheme: string;
    themeSubscription: any;

    flipped = false;

    constructor(private themeService: NbThemeService) {
        this.themeSubscription = this.themeService.getJsTheme().subscribe(theme => {
            this.currentTheme = theme.name;
        });
    }

    ngOnDestroy() {
        this.themeSubscription.unsubscribe();
    }

    toggleView() {
        this.flipped = !this.flipped;
      }
  
}
