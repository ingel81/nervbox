export interface VoteRequest {
  voteValue: 1 | -1;
}

export interface VoteResult {
  success: boolean;
  error?: string;
  upVotes: number;
  downVotes: number;
  score: number;
  userVote?: number;
  creditsEarned?: number;
}

export interface SoundVoteStats {
  soundHash: string;
  upVotes: number;
  downVotes: number;
  score: number;
}

export interface SoundWithVotes {
  hash: string;
  name: string;
  upVotes: number;
  downVotes: number;
  score: number;
}

export interface VoteUpdateEvent {
  soundHash: string;
  upVotes: number;
  downVotes: number;
  score: number;
  timestamp: string;
}
