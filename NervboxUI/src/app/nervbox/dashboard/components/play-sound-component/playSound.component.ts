import { Component, OnDestroy } from '@angular/core';
import { NbThemeService } from '@nebular/theme';
import { SoundService, ISound } from '../../../services/sound.service';

@Component({
    selector: 'play-sounds',
    styleUrls: ['./playSound.component.scss'],
    templateUrl: './playSound.component.html',
})
export class PlaySoundComponent implements OnDestroy {

    public sounds: Array<ISound>;
    public filterargs = { fileName: '' };

    currentTheme: string;
    themeSubscription: any;

    constructor(private themeService: NbThemeService, private soundService: SoundService) {
        this.themeSubscription = this.themeService.getJsTheme().subscribe(theme => {
            this.currentTheme = theme.name;
        });

        this.soundService.getSounds().subscribe(sounds => {
            this.sounds = sounds;
        }, err => {

        });
    }

    ngOnDestroy() {
        this.themeSubscription.unsubscribe();
    }

    playSound(sound: ISound): void {
        this.soundService.playSound(sound.hash).subscribe(res => {}, err => {});
    }

}
