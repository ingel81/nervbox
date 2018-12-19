import { Component, AfterViewInit, OnDestroy, OnInit, Input, OnChanges, SimpleChanges } from '@angular/core';
import { NbThemeService, NbToastrService, NbGlobalLogicalPosition, NbGlobalPositionStrategy, NbGlobalPhysicalPosition } from '@nebular/theme';
import { NervboxDataService, ITimescaleQueryParameters } from '../../../services/nervboxdata.service';
import { IValueMode } from './temperature.component';
import * as moment from 'moment';
import { NbToastStatus } from '@nebular/theme/components/toastr/model';

@Component({
  selector: 'temperature-chart',
  template: `
    <div class="temperature-chart-wrapper">
      <div *ngIf="loading" class="loading-overlay"><h1 class="loading-text">Loading...</h1></div>  
      <div echarts [options]="options" class="echart"></div>      
    </div>
  `,
  styleUrls: ['./temperature-chart.component.scss'],
})

export class TemperatureChartComponent implements AfterViewInit, OnDestroy, OnInit, OnChanges {
  options: any = {};
  themeSubscription: any;

  @Input() mode: string;
  @Input() valueMode: IValueMode;

  loading: boolean = false;

  private data: any = {};

  constructor(private theme: NbThemeService, private toastrService: NbToastrService, private nervboxDataService: NervboxDataService) {
  }

  ngOnInit() {
    console.log("ngOnInit");
  }

  ngOnChanges(changes: SimpleChanges) {
    this.refreshData();
  }

  refreshData() {

    this.loading = true;

    var query: ITimescaleQueryParameters = null;
    switch (this.mode) {

      case "last hour":
        query = { metric: this.valueMode.metric, aggregation: this.valueMode.aggregationType, bucketSize: 1, bucketType: 'minute', limit: 60 };
        break;

      case "last 24h":
        query = { metric: this.valueMode.metric, aggregation: this.valueMode.aggregationType, bucketSize: 5, bucketType: 'minute', limit: 288 };
        break;

      case "last 7 days":
        query = { metric: this.valueMode.metric, aggregation: this.valueMode.aggregationType, bucketSize: 1, bucketType: 'hour', limit: 168 };
        break;

      case "last 30 days":
        query = { metric: this.valueMode.metric, aggregation: this.valueMode.aggregationType, bucketSize: 5, bucketType: 'hour', limit: 144 };
        break;

      case "last 365 days":
        query = { metric: this.valueMode.metric, aggregation: this.valueMode.aggregationType, bucketSize: 1, bucketType: 'day', limit: 365 };
        break;
    }

    this.nervboxDataService.getTimescaleValues(query).subscribe(res => {

      console.log("data query duration [mS]: ", res.duration);

      this.data.combined = res.values;
      this.data.keys = [];
      this.data.values = [];

      res.values.forEach(element => {
        this.data.keys.push(element.k);
        this.data.values.push(element.v);
      });

      this.initChartOptions();
      this.loading = false;
    }, err => {
      //TODO:

      this.toastrService.show(err.message, "Error loading chart data", {
        status : NbToastStatus.DANGER,
        duration: 0,
        position: NbGlobalPhysicalPosition.BOTTOM_RIGHT
      });

    });
  }

  initChartOptions() {
    this.themeSubscription = this.theme.getJsTheme().subscribe(config => {

      const colors: any = config.variables;
      const echarts: any = config.variables.echarts;

      this.options = {
        backgroundColor: echarts.bg,
        color: [colors.success, colors.info],
        tooltip: {
          trigger: 'none',
          axisPointer: {
            type: 'cross',
          },
        },
        legend: {
          data: ['Temperature', 'Humidity'],
          textStyle: {
            color: echarts.textColor,
          },
        },
        grid: {
          top: 70,
          bottom: 50,
        },
        xAxis: [
          {
            type: 'category',
            axisTick: {
              alignWithLabel: true,
            },
            axisLine: {
              onZero: false,
              lineStyle: {
                color: colors.info,
              },
            },
            axisLabel: {
              textStyle: {
                color: echarts.textColor,
              },
              formatter: (value, index) => {
                // Formatted to be month/day; display year only in the first label

                var date = moment(value);
                var label: string = "";

                switch (this.mode) {
                  case "last hour":
                    label = date.format('HH:mm');

                    if (index === 0) {
                      label = date.format('YYYY-MM-DD') + " " + label;
                    }

                    break;

                  case "last 24h":
                    label = date.format('HH:mm');

                    if (index === 0) {
                      label = date.format('YYYY-MM-DD') + " " + label;
                    }

                    break;

                  case "last 7 days":
                    label = date.format('MM-DD HH:mm');

                    if (index === 0) {
                      label = date.format('YYYY-') + label;
                    }

                    break;

                  case "last 30 days":
                    label = date.format('MM-DD HH:mm');

                    if (index === 0) {
                      label = date.format('YYYY-') + label;
                    }

                    break;

                  case "last 365 days":
                    label = date.format('MM-DD');

                    if (index === 0) {
                      label = date.format('YYYY-') + "" + label;
                    }

                    break;
                }

                return label;
              }
            },
            axisPointer: {
              label: {
                formatter: params => {
                  return (
                    'Temperatur  ' + moment(params.value).format('YYYY-MM-DD HH:mm') + (params.seriesData.length ? '：' + params.seriesData[0].data : '')
                  );
                },
              },
            },
            data: this.data.keys,
          },
          {
            type: 'category',
            axisTick: {
              alignWithLabel: true,
            },
            axisLine: {
              onZero: false,
              lineStyle: {
                color: colors.success,
              },
            },
            axisLabel: {
              textStyle: {
                color: echarts.textColor,
              },
            },
            axisPointer: {
              label: {
                formatter: params => {
                  return (
                    'Precipitation  ' + params.value + (params.seriesData.length ? '：' + params.seriesData[0].data : '')
                  );
                },
              },
            },
            data: this.data.keys,
          },
        ],
        yAxis: [
          {
            type: 'value',
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
            },
          },
        ],
        series: [
          {
            name: '2015 Precipitation',
            type: 'line',
            xAxisIndex: 1,
            smooth: true,
            data: this.data.values,
          },
          {
            name: '2016 Precipitation',
            type: 'line',
            smooth: true,
            data: this.data.values,
          },
        ],
      };
    });

  }

  ngAfterViewInit() {

    console.log("ngAfterViewInit");

  }

  ngOnDestroy(): void {
    //this.themeSubscription.unsubscribe();
  }
}
