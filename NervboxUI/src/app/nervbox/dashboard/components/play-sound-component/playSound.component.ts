import { Component, OnInit, OnDestroy } from '@angular/core';
import { NbThemeService, NbToastrService, NbGlobalLogicalPosition, NbGlobalPositionStrategy, NbGlobalPhysicalPosition } from '@nebular/theme';
import { SoundService, ISound } from '../../../services/sound.service';
import { HubConnection, HubConnectionBuilder, LogLevel, HttpTransportType } from '@aspnet/signalr';
import { environment } from '../../../../../environments/environment';
import { NbToastStatus } from '@nebular/theme/components/toastr/model';


export interface ISoundPlayed {
    initiator: string,
    time: Date,
    soundHash: string,
    fileName: string
}

@Component({
    selector: 'play-sounds',
    styleUrls: ['./playSound.component.scss'],
    templateUrl: './playSound.component.html',
})
export class PlaySoundComponent implements OnDestroy, OnInit {

    public sounds: Array<ISound>;
    public filterargs = { fileName: '' };

    public orderModes: any[] = [
        { mode: 'fileName', displayName: "Name (a-z)", reverse: false },
        { mode: 'size', displayName: "Größe (aufsteigend)", reverse: false },
        { mode: 'played', displayName: "Gespielt (absteigend)", reverse: true }
    ];

    public order: any = this.orderModes[0];

    public currentTheme: string;
    public themeSubscription: any;
    private hubConnection: HubConnection;

    constructor(
        private toastrService: NbToastrService,
        private themeService: NbThemeService,
        private soundService: SoundService) {
        this.themeSubscription = this.themeService.getJsTheme().subscribe(theme => {
            this.currentTheme = theme.name;
        });

        this.soundService.getSounds().subscribe(sounds => {
            this.sounds = sounds;
        }, err => {

        });
    }

    ngOnInit() {
        this.initWebSocket();
    }

    ngOnDestroy() {
        this.themeSubscription.unsubscribe();
    }

    initWebSocket(): void {
        this.hubConnection = new HubConnectionBuilder()
            .withUrl(environment.signalrSoundUrl, HttpTransportType.WebSockets)
            .configureLogging(LogLevel.Trace)
            .build();

        this.hubConnection.serverTimeoutInMilliseconds = 5000000;

        this.hubConnection.on('soundPlayed', (sound: ISoundPlayed) => {

            this.toastrService.show("played '" + sound.fileName + "'", sound.initiator, {
                status: NbToastStatus.SUCCESS,
                duration: 5000,
                position: NbGlobalPhysicalPosition.BOTTOM_RIGHT
            });

            this.sounds.filter(i => i.hash === sound.soundHash).forEach(a => {

                a.active = true;
                setTimeout(() => {
                    a.active = false;
                }, 5000);
            });
        });

        this.hubConnection.onclose(error => {
            setTimeout(() => { this.initWebSocket() }, 5000);
        });

        this.hubConnection.start().then(() => {
        }).catch(error => {
            setTimeout(() => { this.initWebSocket() }, 5000);
        });
    }

    playSound(sound: ISound): void {
        this.soundService.playSound(sound.hash).subscribe(res => { }, err => { });
    }

    killAllSounds(){
        this.soundService.killAllSounds().subscribe(res => {}, err => {});
    }

}
