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

export interface Tag {
  id: number;
  name: string;
  color: string;
  soundCount?: number;
}

export interface SoundUpdateRequest {
  name?: string;
  enabled?: boolean;
  tags?: string[];
}

export interface TagCreateRequest {
  name: string;
  color?: string;
}

export interface TagUpdateRequest {
  name: string;
  color?: string;
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
