import { Component, Input } from '@angular/core';

export enum Mode { Status = "Status", Text = "Test" }

@Component({
  selector: 'status-widget',
  styleUrls: ['./statusWidget.component.scss'],
  templateUrl: 'statusWidget.component.html',
})
export class StatusWidgetComponent {
  @Input() title: string;
  @Input() type: string;
  @Input() on = true;
  @Input() message: string;
}