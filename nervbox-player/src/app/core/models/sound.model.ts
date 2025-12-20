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
  authorId?: number;
  upVotes?: number;
  downVotes?: number;
  score?: number;
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
  isPinned: boolean;
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
  isPinned?: boolean;
}

export interface TagUpdateRequest {
  name: string;
  color?: string;
  isPinned?: boolean;
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
