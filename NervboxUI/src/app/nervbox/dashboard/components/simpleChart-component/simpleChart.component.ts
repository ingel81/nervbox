import { Component, AfterViewInit, OnDestroy, OnInit, Input, OnChanges, SimpleChanges } from '@angular/core';
import { NbThemeService, NbToastrService, NbGlobalLogicalPosition, NbGlobalPositionStrategy, NbGlobalPhysicalPosition } from '@nebular/theme';
import { NervboxDataService, ISimpleTimescaleQueryParameters, IDefaultQueryRange, QueryRangeKey, IMetricType } from '../../../services/nervboxdata.service';
import { ISound, ISoundPlayed } from '../../../services/sound.service';
import { HubConnection, HubConnectionBuilder, LogLevel, HttpTransportType } from '@aspnet/signalr';
import * as moment from 'moment';

import { environment } from '../../../../../environments/environment';
import { DecimalPipe } from '@angular/common';
import { Subscription } from 'rxjs';

@Component({
  selector: 'simple-chart',
  template: `
    <div class="simple-chart-wrapper">
      <div *ngIf="loading" class="loading-overlay"><h1 class="loading-text">Loading...</h1></div>  
      <div echarts [options]="options" [merge]="updateOptions" (chartInit)="onChartInit($event)" class="echart"></div>      

      <div *ngIf="recordCount === 0 && loading === false" class="no-data">
        <nb-alert status="info">Der gewählte Zeitraum enthält keine Daten.</nb-alert>
      </div>
    </div>
  `,
  styleUrls: ['./simpleChart.component.scss'],
})

export class SimpleChartComponent implements AfterViewInit, OnDestroy, OnInit, OnChanges {

  private subscribers: Subscription[] = [];

  options: any = {};
  updateOptions: any = {};

  @Input() queryRange: IDefaultQueryRange;
  @Input() metricMode: IMetricType;
  @Input() selectedDataPointOption : string;

  loading: boolean = false;
  stopped: boolean = false;

  public recordCount: number = -1;
  private data: Array<any>;
  private hubConnection: HubConnection;
  private echartsInstance: any;

  constructor(
    private theme: NbThemeService,
    private toastrService: NbToastrService,
    private nervboxDataService: NervboxDataService,
    private decimalPipe: DecimalPipe
  ) {

  }

  ngOnInit() {
    this.initWebSocket();
  }

  ngOnDestroy(): void {
    this.stopped = true;
    this.hubConnection.stop();

    this.subscribers.forEach(item => {
      item.unsubscribe();
    });
  }

  onChartInit(e: any) {
    this.echartsInstance = e;
    console.log('on chart init:', e);
  }

  ngAfterViewInit() {
    console.log("ngAfterViewInit");
  }

  ngOnChanges(changes: SimpleChanges) {
    this.refreshData();
  }

  initWebSocket(): void {
    this.hubConnection = new HubConnectionBuilder()
      .withUrl(environment.signalrSoundUrl, HttpTransportType.WebSockets)
      .configureLogging(LogLevel.Error)
      .build();

    this.hubConnection.serverTimeoutInMilliseconds = 5000000;

    this.hubConnection.on('newMeasure', (message: ISoundPlayed) => {

      //console.log(message);

      if (this.queryRange.key !== QueryRangeKey.LIVE) {
        return;
      }

      var d = moment.utc(message.time, 'YYYY-MM-DDTHH:mm:ss').local().toDate();

      switch (this.metricMode.metricKey) {
        case 'soundhash':
          this.data.push({
            value: [
              d,
              1
            ]
          });
          break;
      }

      if (this.data.length > 100) {
        this.data = this.data.slice(50);
      }

      //update chart
      this.updateOptions = {
        series: [{
          data: this.data
        }]
      }

      this.recordCount = this.data.length;
    });

    this.hubConnection.onclose(error => {
      if (this.stopped) { return; }
      setTimeout(() => { this.initWebSocket() }, 5000);
    });

    this.hubConnection.start().then(() => {
    }).catch(error => {
      if (this.stopped) { return; }
      setTimeout(() => { this.initWebSocket() }, 5000);
    });
  }

  refreshData() {

    this.loading = true;
    var query: ISimpleTimescaleQueryParameters = null;

    if (!this.queryRange) {
      this.loading = false;
      return;
    }

    switch (this.queryRange.key) {

      case QueryRangeKey.LIVE:
        query = { metric: this.metricMode.metricKey, aggregation: this.metricMode.aggregationType, bucketSize: 1, bucketType: 'second', limit: 0, range: this.queryRange.key, dataPointType: this.selectedDataPointOption };
        break;

      case QueryRangeKey.LAST60MINUTES:
        query = { metric: this.metricMode.metricKey, aggregation: this.metricMode.aggregationType, bucketSize: 1, bucketType: 'minute', limit: 60, range: this.queryRange.key, dataPointType: this.selectedDataPointOption  };
        break;

      case QueryRangeKey.LAST24HOURS:
        query = { metric: this.metricMode.metricKey, aggregation: this.metricMode.aggregationType, bucketSize: 5, bucketType: 'minute', limit: 288, range: this.queryRange.key, dataPointType: this.selectedDataPointOption  };
        break;

      case QueryRangeKey.LAST7DAYS:
        query = { metric: this.metricMode.metricKey, aggregation: this.metricMode.aggregationType, bucketSize: 1, bucketType: 'hour', limit: 168, range: this.queryRange.key, dataPointType: this.selectedDataPointOption  };
        break;

      case QueryRangeKey.LAST30DAYS:
        query = { metric: this.metricMode.metricKey, aggregation: this.metricMode.aggregationType, bucketSize: 5, bucketType: 'hour', limit: 144, range: this.queryRange.key, dataPointType: this.selectedDataPointOption  };
        break;

      case QueryRangeKey.LAST365DAYS:
        query = { metric: this.metricMode.metricKey, aggregation: this.metricMode.aggregationType, bucketSize: 1, bucketType: 'day', limit: 365, range: this.queryRange.key, dataPointType: this.selectedDataPointOption  };
        break;
    }

    this.nervboxDataService.getSimpleTimescaleValue(query).subscribe(res => {

      console.log("data query duration [mS]: ", res.duration);

      this.data = [];

      res.values.forEach(element => {
        var d = moment.utc(element.k).local();
        this.data.push({
          //name: element.k,
          value: [
            d.toDate(),
            element.v
          ]
        });
      });

      this.recordCount = res.values.length;

      this.initChartOptions();
      this.loading = false;
    }, err => {

      this.toastrService.show(err.message, "Error loading chart data", {
        status: "danger",
        duration: 0,
        position: NbGlobalPhysicalPosition.BOTTOM_RIGHT,
        destroyByClick: true
      });

    });
  }

  initChartOptions() {

    this.subscribers.forEach(item => {
      item.unsubscribe();
    });

    this.subscribers = [];

    this.subscribers.push(this.theme.getJsTheme().subscribe(config => {

      const colors: any = config.variables;
      const echarts: any = config.variables.echarts;

      this.options = {
        backgroundColor: echarts.bg,
        color: [colors.success, colors.info],
        tooltip: {
          trigger: 'none',
          axisPointer: {
            type: 'cross',
            label: {
              formatter: (value, index) => {
                return this.decimalPipe.transform(value.value, "1.0-3", "de-DE");
              }
            }
          },
        },
        legend: {
          data: [this.metricMode.displayName],
          textStyle: {
            color: echarts.textColor,
          },
        },
        xAxis: {

          name: "Zeit →",
          type: 'time',
          axisLine: {
            onZero: false,
            lineStyle: {
              color: colors.info,
            },
          },
          axisTick: {
            // alignWithLabel: true,
          },
          axisLabel: {
            textStyle: {
              color: echarts.textColor,
            },
            // formatter: (value, index) => {
            //   // Formatted to be month/day; display year only in the first label
            //   var date = new Date(value);
            //   var texts = [(date.getMonth() + 1), date.getDate()];
            //   if (index === 0) {
            //     //texts.unshift(date.getYear());
            //   }
            //   return texts.join('/');
            // }
          },
          axisPointer: {
            label: {
              formatter: params => {
                if (this.metricMode.metricKey.toString().indexOf('cycl_') >= 0) {
                  return (
                    this.metricMode.displayName + ' ' + moment(params.value).format('YYYY-MM-DD HH:mm') + (params.seriesData.length && params.seriesData[0].value[1] ? '：' + this.decimalPipe.transform(params.seriesData[0].value[1], "", "de-DE") : ' Keine Daten')
                  );
                } else {
                  return (
                    this.metricMode.displayName + ' ' + moment(params.value).format('YYYY-MM-DD HH:mm') + (params.seriesData.length && params.seriesData[0].value[1] ? '：' + this.decimalPipe.transform(params.seriesData[0].value[1], "1.3-3", "de-DE") : ' Keine Daten')
                  );
                }
              },
            },
            snap: true,
          },
          splitLine: {
            show: false
          }
        },
        yAxis: {
          name: this.metricMode.unitDisplayName,
          type: 'value',
          scale: true,
          axisLine: {
            lineStyle: {
              color: echarts.axisLineColor,
            },
          },
          splitLine: {
            lineStyle: {
              color: echarts.splitLineColor,
            },
          },
          axisLabel: {
            textStyle: {
              color: echarts.textColor,
            },
            formatter: (value, index) => {
              // Formatted to be month/day; display year only in the first label
              return this.decimalPipe.transform(value, "", "de-DE");
            }
          },
        },
        series: [{
          name: this.metricMode.displayName,
          type: 'line',
          smooth: true,
          connectNulls: false,
          data: this.data
        }]
      };
    }));
  }
}
