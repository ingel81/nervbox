using System.Collections.Generic;
using System.Threading.Tasks;
using NervboxDeamon.Models;

namespace NervboxDeamon.Services.Interfaces
{
    public interface IVoteService
    {
        /// <summary>
        /// Vote on a sound (upvote or downvote)
        /// </summary>
        Task<VoteResult> VoteAsync(int userId, string soundHash, int voteValue);

        /// <summary>
        /// Remove a vote from a sound
        /// </summary>
        Task<VoteResult> RemoveVoteAsync(int userId, string soundHash);

        /// <summary>
        /// Get vote statistics for a specific sound
        /// </summary>
        Task<SoundVoteStats> GetVoteStatsAsync(string soundHash);

        /// <summary>
        /// Get vote statistics for multiple sounds
        /// </summary>
        Task<Dictionary<string, SoundVoteStats>> GetVoteStatsForSoundsAsync(IEnumerable<string> soundHashes);

        /// <summary>
        /// Get a user's vote for a specific sound (null if not voted)
        /// </summary>
        Task<int?> GetUserVoteAsync(int userId, string soundHash);

        /// <summary>
        /// Get all votes for a user (soundHash -> voteValue)
        /// </summary>
        Task<Dictionary<string, int>> GetUserVotesAsync(int userId);

        /// <summary>
        /// Get top-rated sounds by score
        /// </summary>
        Task<List<SoundWithVotes>> GetTopRatedSoundsAsync(int limit = 25);

        /// <summary>
        /// Get bottom-rated sounds by score
        /// </summary>
        Task<List<SoundWithVotes>> GetBottomRatedSoundsAsync(int limit = 25);
    }
}
