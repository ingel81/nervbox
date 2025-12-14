export interface Sound {
  hash: string;
  name: string;
  fileName: string;
  durationMs: number;
  sizeBytes: number;
  tags: string[];
  enabled: boolean;
  createdAt: string;
  playCount?: number;
}

export interface TopSound {
  hash: string;
  name: string;
  count: number;
}

export interface SoundPlayedEvent {
  initiator: {
    name: string;
    id: number;
  };
  time: string;
  soundHash: string;
  fileName: string;
}
