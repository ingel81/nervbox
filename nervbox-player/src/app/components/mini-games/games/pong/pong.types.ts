/** LAN-Pong: Datenformen des PongHub (/ws/pongHub), siehe NervboxDeamon/Services/PongService.cs */

export type PongPhase = 'countdown' | 'play' | 'paused' | 'over';

export interface PongUser {
  id: number;
  name: string;
  /** lobby = Spiel offen und frei, playing = im Match, online = eingeloggt, Spiel zu */
  status: 'lobby' | 'playing' | 'online';
}

export interface PongInvite {
  id: string;
  fromId: number;
  fromName: string;
  toId: number | null;
  toName: string | null;
  stake: number;
  open: boolean;
}

export interface PongMatchSummary {
  id: string;
  names: [string, string];
  s: [number, number];
  stake: number;
  cpu: boolean;
}

export interface PongLobby {
  users: PongUser[];
  invites: PongInvite[];
  matches: PongMatchSummary[];
}

/** Kompakter Zustand, 30 Hz vom Server */
export interface PongState {
  id: string;
  /** Serverzeit in ms */
  t: number;
  ph: PongPhase;
  /** Restzeit der Phase (Countdown / Pause) in s */
  pt: number;
  /** Ball: x, y, vx, vy */
  b: [number, number, number, number];
  /** Schlaeger-Mitte (y) Slot 0 / 1 */
  p: [number, number];
  s: [number, number];
  /** verbunden */
  c: [boolean, boolean];
  /** will Revanche */
  r: [boolean, boolean];
  /** hat das Match verlassen */
  l: [boolean, boolean];
  /** Sieger-Slot, -1 = keiner */
  w: number;
  /** score | forfeit | disconnect */
  er: string | null;
  /** Ballwechsel-Treffer */
  n: number;
}

export interface PongField {
  w: number;
  h: number;
  padX: number;
  padW: number;
  padH: number;
  ballR: number;
}

export interface PongMatchInfo {
  id: string;
  /** eigener Slot, -1 = Zuschauer */
  slot: number;
  names: [string, string];
  userIds: [number, number];
  cpu: boolean;
  stake: number;
  pot: number;
  winScore: number;
  field: PongField;
  state: PongState;
}

export interface PongEvent {
  id: string;
  k: 'hit' | 'wall' | 'goal' | 'serve' | 'pause' | 'resume' | 'over';
  side?: number;
  x?: number;
  y?: number;
  sp?: number;
  n?: number;
  s?: [number, number];
  reason?: string;
}

export interface PongInviteClosed {
  id: string;
  reason: 'declined' | 'cancelled' | 'expired' | 'accepted' | 'failed';
  message: string | null;
}
