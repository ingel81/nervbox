import { Injectable, inject, signal } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { environment } from '../../../../../environments/environment';
import { AuthService } from '../../../../core/services/auth.service';
import {
  PongEvent,
  PongInvite,
  PongInviteClosed,
  PongLobby,
  PongMatchInfo,
  PongState,
} from './pong.types';

/**
 * Verbindung zum PongHub. Laeuft fuer jeden eingeloggten Nutzer dauerhaft (Einladungs-Toast auch bei
 * geschlossenem Spiel), das Spiel selbst haengt sich ueber onState/onEvent an.
 * 30-Hz-Zustaende gehen bewusst NICHT durch Signals, nur Lobby/Einladungen/Match-Wechsel.
 */
@Injectable({ providedIn: 'root' })
export class PongClientService {
  private readonly auth = inject(AuthService);
  private conn: signalR.HubConnection | null = null;
  private starting: Promise<void> | null = null;

  readonly connected = signal(false);
  readonly lobby = signal<PongLobby>({ users: [], invites: [], matches: [] });
  /** Einladungen an mich (Toast / Lobby) */
  readonly incoming = signal<PongInvite[]>([]);
  readonly match = signal<PongMatchInfo | null>(null);
  /** kurze Meldung (abgelehnt, abgelaufen, Fehler ...) */
  readonly notice = signal<{ text: string; at: number } | null>(null);
  /** Spieldialog offen? (dann kein globaler Toast) */
  readonly gameOpen = signal(false);

  onState: ((s: PongState, recvAt: number) => void) | null = null;
  onEvent: ((e: PongEvent) => void) | null = null;

  async connect(): Promise<void> {
    if (this.conn) return this.starting ?? Promise.resolve();
    const baseUrl = environment.apiUrl.replace('/api', '');
    const conn = new signalR.HubConnectionBuilder()
      .withUrl(`${baseUrl}/ws/pongHub`, { accessTokenFactory: () => this.auth.getToken() || '' })
      .withAutomaticReconnect([0, 500, 1000, 2000, 3000, 5000, 10000, 20000])
      .configureLogging(signalR.LogLevel.Warning)
      .build();
    this.conn = conn;

    conn.on('lobby', (l: PongLobby) => this.lobby.set(l));
    conn.on('invite', (i: PongInvite) =>
      this.incoming.update((list) => [...list.filter((x) => x.id !== i.id), i]),
    );
    conn.on('inviteClosed', (c: PongInviteClosed) => {
      this.incoming.update((list) => list.filter((x) => x.id !== c.id));
      if (c.message && c.reason !== 'accepted') this.say(c.message);
    });
    conn.on('match', (m: PongMatchInfo) => {
      this.incoming.set([]);
      this.match.set(m);
      this.onState?.(m.state, performance.now());
    });
    conn.on('state', (s: PongState) => {
      if (s.id === this.match()?.id) this.onState?.(s, performance.now());
    });
    conn.on('ev', (e: PongEvent) => {
      if (e.id === this.match()?.id) this.onEvent?.(e);
    });
    conn.on('notice', (n: { message: string }) => this.say(n.message));

    conn.onclose(() => this.connected.set(false));
    conn.onreconnecting(() => this.connected.set(false));
    conn.onreconnected(async () => {
      this.connected.set(true);
      if (this.gameOpen()) await this.safeInvoke('EnterLobby');
      const m = await this.safeInvoke<PongMatchInfo | null>('Rejoin');
      if (m) {
        this.match.set(m);
        this.onState?.(m.state, performance.now());
      } else if (this.match()) {
        this.match.set(null);
        this.say('Das Spiel ist inzwischen vorbei.');
      }
    });

    this.starting = conn
      .start()
      .then(() => this.connected.set(true))
      .catch((err) => {
        console.warn('Pong hub connection failed:', err);
        this.conn = null;
      })
      .finally(() => (this.starting = null));
    return this.starting;
  }

  async disconnect(): Promise<void> {
    const c = this.conn;
    this.conn = null;
    this.connected.set(false);
    this.incoming.set([]);
    this.match.set(null);
    await c?.stop().catch(() => undefined);
  }

  say(text: string): void {
    this.notice.set({ text, at: Date.now() });
  }

  async enterLobby(): Promise<void> {
    this.gameOpen.set(true);
    await this.connect();
    await this.safeInvoke('EnterLobby');
    // nach einem Reload: laufendes Match wieder aufnehmen
    if (!this.match()) {
      const m = await this.safeInvoke<PongMatchInfo | null>('Rejoin');
      if (m) this.match.set(m);
    }
  }

  async leaveLobby(): Promise<void> {
    this.gameOpen.set(false);
    const m = this.match();
    if (m) await this.leaveMatch();
    await this.safeInvoke('LeaveLobby');
  }

  challenge(userId: number | null, stake: number): Promise<string | null> {
    return this.call('Challenge', userId, stake);
  }
  cancelInvite(id: string): Promise<string | null> {
    return this.call('CancelInvite', id);
  }
  async accept(id: string): Promise<string | null> {
    await this.connect();
    this.incoming.update((l) => l.filter((x) => x.id !== id));
    return this.call('Accept', id);
  }
  decline(id: string): Promise<string | null> {
    this.incoming.update((l) => l.filter((x) => x.id !== id));
    return this.call('Decline', id);
  }
  playCpu(): Promise<string | null> {
    return this.call('PlayCpu');
  }
  rematch(): Promise<string | null> {
    const m = this.match();
    return m ? this.call('Rematch', m.id) : Promise.resolve(null);
  }
  async spectate(matchId: string): Promise<void> {
    const m = await this.safeInvoke<PongMatchInfo | null>('Spectate', matchId);
    if (m) this.match.set(m);
    else this.say('Das Spiel ist schon vorbei.');
  }
  async leaveMatch(): Promise<void> {
    const m = this.match();
    this.match.set(null);
    if (m) await this.safeInvoke('Leave', m.id);
  }

  /** Schlaegerposition (Feld-y), fire-and-forget */
  sendInput(matchId: string, y: number): void {
    if (this.conn?.state !== signalR.HubConnectionState.Connected) return;
    this.conn.send('Input', matchId, Math.round(y * 10) / 10).catch(() => undefined);
  }

  private async call(method: string, ...args: unknown[]): Promise<string | null> {
    const err = await this.safeInvoke<string | null>(method, ...args);
    if (err) this.say(err);
    return err ?? null;
  }

  private async safeInvoke<T>(method: string, ...args: unknown[]): Promise<T | null> {
    if (!this.conn) await this.connect();
    if (this.conn?.state !== signalR.HubConnectionState.Connected) {
      if (method !== 'LeaveLobby' && method !== 'Leave') this.say('Keine Verbindung zur Nervbox.');
      return null;
    }
    try {
      return await this.conn.invoke<T>(method, ...args);
    } catch (err) {
      console.warn(`Pong ${method} failed:`, err);
      return null;
    }
  }
}
