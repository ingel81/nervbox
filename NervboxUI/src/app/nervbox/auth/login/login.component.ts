import { Component, OnInit, ChangeDetectorRef, Inject } from '@angular/core';
import { NbLoginComponent, NbAuthService, NB_AUTH_OPTIONS } from '@nebular/auth';
import { Router } from '@angular/router';
import { SystemService } from '../../services/system.service';
import * as moment from 'moment';

@Component({
  selector: 'ngx-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class NervboxLoginComponent extends NbLoginComponent implements OnInit {

  constructor(private systemService: SystemService, authService: NbAuthService, @Inject(NB_AUTH_OPTIONS) options: {}, cd: ChangeDetectorRef, router: Router) {
    super(authService, options, cd, router);

    /*
    authService.onTokenChange().subscribe(response => {
      console.log("ontokenchange", response, response.isValid());
    }, err => {
      console.log("ontokenchange_error", err);
    });
    */
  }

  public datesRaspian: any;
  public datesBrowser: any;
  public delta: any;

  ngOnInit(): void {
    this.checkDates();
  }

  checkDates() {
    this.systemService.getDate().subscribe(dates => {

      this.datesRaspian = {
        date: moment(dates.date).format(),
        dateUtc: moment(dates.dateUtc).utc(),
      };

      this.datesBrowser = {
        date: moment().format(),
        dateUtc: moment.utc(),
      };

      this.delta = {
        unix: 0,
        abs: 0,
      };

      // compare browser and ***REMOVED*** date
      if (moment(this.datesRaspian.date).unix() !== moment(this.datesBrowser.date).unix()) {
        this.delta.unix = moment(this.datesRaspian.date).unix() - moment(this.datesBrowser.date).unix();
        this.delta.abs = Math.abs(this.delta.unix);
      }

    }, err => {
      this.datesRaspian = null;
    });
  }

  fixDate(): void {

    this.systemService.setDate(moment().format()).subscribe(res => {
      setTimeout(() => {
        this.checkDates();
      }, 5000);
    }, err => {

    });
  }

}
