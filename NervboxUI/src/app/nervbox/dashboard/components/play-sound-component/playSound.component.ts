import { Component, OnInit, OnDestroy } from '@angular/core';
import { NbThemeService, NbToastrService, NbGlobalPhysicalPosition } from '@nebular/theme';
import { SoundService, ISound } from '../../../services/sound.service';
import { environment } from '../../../../../environments/environment';
import { Observable, Subscription } from 'rxjs';



@Component({
    selector: 'play-sounds',
    styleUrls: ['./playSound.component.scss'],
    templateUrl: './playSound.component.html',
})
export class PlaySoundComponent implements OnDestroy, OnInit {

    public sounds: Array<ISound>;
    public filterargs = { fileName: '' };

    public orderModes: any[] = [
        { mode: 'fileName', displayName: 'Name (a-z)', reverse: false },
        { mode: 'size', displayName: 'Größe (aufsteigend)', reverse: false },
        { mode: 'duration', displayName: 'Dauer (aufsteigend)', reverse: false },
        { mode: 'played', displayName: 'Gespielt (absteigend)', reverse: true },
    ];

    public order: any = this.orderModes[0];

    public currentTheme: string;
    public themeSubscription: any;
    public soundSubscription: Subscription;

    constructor(
        private toastrService: NbToastrService,
        private themeService: NbThemeService,
        private soundService: SoundService) {
        this.themeSubscription = this.themeService.getJsTheme().subscribe(theme => {
            this.currentTheme = theme.name;
        });

        this.soundService.getSounds().subscribe(sounds => {
            debugger;
            this.sounds = sounds;
        }, err => {

        });
    }

    ngOnInit() {

        this.soundSubscription = this.soundService.OnSoundPlayed.subscribe(sound => {

            if(!sound) return;

            this.toastrService.show('played \'' + sound.fileName + '\'', sound.initiator.name, {
                status: 'success',
                duration: 5000,
                position: NbGlobalPhysicalPosition.BOTTOM_RIGHT,
            });

            this.sounds.filter(i => i.hash === sound.soundHash).forEach(a => {

                a.active = true;
                setTimeout(() => {
                    a.active = false;
                }, 5000);
            });            
        });

    }

    ngOnDestroy() {
        this.themeSubscription.unsubscribe();
        this.soundSubscription.unsubscribe();
    }

    playSound(sound: ISound): void {
        this.soundService.playSound(sound.hash).subscribe(res => { }, err => { });
    }

    killAllSounds() {
        this.soundService.killAllSounds().subscribe(res => {}, err => {});
    }

}
