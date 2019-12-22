import { Component, OnDestroy, Input, SimpleChanges, OnChanges, OnInit } from '@angular/core';
import { NbThemeService } from '@nebular/theme';
import { SoundService } from '../../../services/sound.service';
import { CamService } from '../../../services/cam.service';
import { environment } from '../../../../../environments/environment';


@Component({
  selector: 'nervbox-cam',
  styleUrls: ['./cam.component.scss'],
  templateUrl: './cam.component.html',
})
export class CamComponent implements OnDestroy, OnInit {

  currentTheme: string;
  themeSubscription: any;
  imageUrl: string;

  constructor(private themeService: NbThemeService, private camService: CamService) {
    this.themeSubscription = this.themeService.getJsTheme().subscribe(theme => {
      this.currentTheme = theme.name;
    });
  }

  ngOnInit(): void {
    this.camService.OnNewImage.subscribe(obs => {

      if (obs) {
        console.log('new image ready');
        this.imageUrl = environment.apiUrl + '/cam?ts=' + Date.now();
      }

    }, err => {

    });

  }

  ngOnDestroy() {
    this.themeSubscription.unsubscribe();
  }


  move(dir: string): void {
    this.camService.move(dir).subscribe(res => {

    });
  }
}
