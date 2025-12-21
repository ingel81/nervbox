import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api.service';
import { SoundService } from './sound.service';
import { VoteResult, SoundWithVotes } from '../models';

@Injectable({
  providedIn: 'root',
})
export class VoteService {
  private readonly api = inject(ApiService);
  private readonly soundService = inject(SoundService);

  // User's votes: soundHash -> voteValue (1 or -1)
  private readonly _userVotes = signal<Record<string, number>>({});
  readonly userVotes = this._userVotes.asReadonly();

  /**
   * Load all votes for the current user
   */
  loadUserVotes(): Observable<Record<string, number>> {
    return this.api.get<Record<string, number>>('/vote/user').pipe(
      tap(votes => this._userVotes.set(votes))
    );
  }

  /**
   * Get user's vote for a specific sound
   */
  getUserVote(soundHash: string): number | undefined {
    return this._userVotes()[soundHash];
  }

  /**
   * Vote on a sound (upvote or downvote)
   */
  vote(soundHash: string, voteValue: 1 | -1): Observable<VoteResult> {
    return this.api.post<VoteResult>(`/vote/${soundHash}`, { voteValue }).pipe(
      tap(result => {
        if (result.success) {
          this._userVotes.update(votes => ({
            ...votes,
            [soundHash]: voteValue
          }));
          // Update sound score immediately
          this.soundService.updateSoundVotes(soundHash, result.upVotes, result.downVotes, result.score);
        }
      })
    );
  }

  /**
   * Remove vote from a sound
   */
  removeVote(soundHash: string): Observable<VoteResult> {
    return this.api.delete<VoteResult>(`/vote/${soundHash}`).pipe(
      tap(result => {
        if (result.success) {
          this._userVotes.update(votes => {
            const newVotes = { ...votes };
            delete newVotes[soundHash];
            return newVotes;
          });
          // Update sound score immediately
          this.soundService.updateSoundVotes(soundHash, result.upVotes, result.downVotes, result.score);
        }
      })
    );
  }

  /**
   * Toggle vote on a sound:
   * - If not voted, set to voteValue
   * - If same vote, remove it
   * - If different vote, change it
   */
  toggleVote(soundHash: string, voteValue: 1 | -1): Observable<VoteResult> {
    const currentVote = this.getUserVote(soundHash);

    if (currentVote === voteValue) {
      // Same vote, remove it
      return this.removeVote(soundHash);
    } else {
      // No vote or different vote, set new vote
      return this.vote(soundHash, voteValue);
    }
  }

  /**
   * Get top-rated sounds
   */
  getTopRated(limit = 25): Observable<SoundWithVotes[]> {
    return this.api.get<SoundWithVotes[]>(`/vote/statistics/toprated?limit=${limit}`);
  }

  /**
   * Get bottom-rated sounds
   */
  getBottomRated(limit = 25): Observable<SoundWithVotes[]> {
    return this.api.get<SoundWithVotes[]>(`/vote/statistics/bottomrated?limit=${limit}`);
  }

  /**
   * Update local vote state from SignalR event
   */
  updateVoteFromEvent(soundHash: string, userVote: number | undefined): void {
    if (userVote !== undefined) {
      this._userVotes.update(votes => ({
        ...votes,
        [soundHash]: userVote
      }));
    }
  }

  /**
   * Clear user votes (e.g., on logout)
   */
  clearUserVotes(): void {
    this._userVotes.set({});
  }
}
