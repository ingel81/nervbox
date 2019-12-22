import { Component, OnInit, OnDestroy } from '@angular/core';
import { NbThemeService, NbToastrService, NbGlobalPhysicalPosition } from '@nebular/theme';
import { environment } from '../../../../../environments/environment';
import { Observable, Subscription } from 'rxjs';
import { NbAuthService, NbAuthJWTToken } from '@nebular/auth';
import { IChatMessage, ChatService } from '../../../services/chat.service';

@Component({
  selector: 'nervbox-chat',
  styleUrls: ['./chat.component.scss'],
  templateUrl: './chat.component.html',
})
export class ChatComponent implements OnDestroy, OnInit {

  public currentTheme: string;
  public themeSubscription: any;

  public user: any;
  public messages: IChatMessage[];

  constructor(
    private toastrService: NbToastrService,
    private themeService: NbThemeService,
    private authService: NbAuthService,
    private chatService: ChatService,
  ) {
    this.themeSubscription = this.themeService.getJsTheme().subscribe(theme => {
      this.currentTheme = theme.name;
    });
  }

  ngOnInit() {

    this.authService.onTokenChange()
      .subscribe((token: NbAuthJWTToken) => {
        if (token.isValid()) {
          this.user = token.getPayload();
        }
      });

    this.messages = [];

    this.chatService.OnNewChatMessage.subscribe(msg => {
      if (this.user.unique_name === msg.userId) {
        msg.reply = true;
      }

      this.messages.push(msg);
    }, err => {

    });
  }

  ngOnDestroy() {
    this.themeSubscription.unsubscribe();
  }

  sendMessage(event: any) {
    const msg = {
      message: event.message,
      date: new Date(),
      type: 'text',
      reply: false,
      username: this.user.userName,
      userId: this.user.unique_name,
    };

    this.chatService.sendMessage(msg);
  }

}
