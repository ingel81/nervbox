import { Component, OnDestroy } from '@angular/core';
import { takeWhile } from 'rxjs/operators/takeWhile';
import { NbDialogService } from '@nebular/theme';
import { ConfirmationComponent } from '../components/confirmation-component/confirmation.component';
import { ISetting } from '../services/nervboxsettings.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'nervbox-dashboard',
  styleUrls: ['./dashboard.component.scss'],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnDestroy {

  private subscribers: Subscription[] = [];

  public featuresDict: { [key: string]: ISetting };

  constructor(
    private dialogService: NbDialogService,
    ) {

  }

  ngOnDestroy() {
    this.subscribers.forEach(item => {
      item.unsubscribe();
    });
  }

  getColorString(color1: string, color2: string) {
    if (color1 === color2) {
      return this.translateColor(color1) + ' / ' + color1;
    } else {

      let r = '';

      if (color1 !== 'Off') {
        r += this.translateColor(color1) + ' / ' + color1;
      }

      if (color2 !== 'Off') {
        if (r.length > 0) {
          r += '<br>';
        }

        r += this.translateColor(color2) + ' / ' + color2;
      }

      return r;
    }
  }

  translateColor(color: string) {

    // Off = 0,
    // Green = 1,
    // Blue = 2,
    // Turquoise = 3,
    // Red = 4,
    // Yellow = 5,
    // Purple = 6,
    // White = 7

    // console.log(color);

    switch (color) {

      case 'Off':
        return 'Aus';

      case 'Green':
        return 'Grün';

      case 'Blue':
        return 'Blau';

      case 'Turquoise':
        return 'Türkis';

      case 'Red':
        return 'Rot';

      case 'Yellow':
        return 'Gelb';

      case 'Purple':
        return 'lila';

      case 'White':
        return 'Weiß';

      default:
        return '-';

    }

  }
}
