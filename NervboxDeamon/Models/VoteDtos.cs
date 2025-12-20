using System.ComponentModel.DataAnnotations;

namespace NervboxDeamon.Models
{
    public class VoteRequest
    {
        /// <summary>
        /// +1 = Upvote, -1 = Downvote
        /// </summary>
        [Required]
        [Range(-1, 1)]
        public int VoteValue { get; set; }
    }

    public class VoteResult
    {
        public bool Success { get; set; }
        public string Error { get; set; }
        public int UpVotes { get; set; }
        public int DownVotes { get; set; }
        public int Score { get; set; }
        public int? UserVote { get; set; }
        public int? CreditsEarned { get; set; }
    }

    public class SoundVoteStats
    {
        public string SoundHash { get; set; }
        public int UpVotes { get; set; }
        public int DownVotes { get; set; }
        public int Score { get; set; }
    }

    public class SoundWithVotes
    {
        public string Hash { get; set; }
        public string Name { get; set; }
        public int UpVotes { get; set; }
        public int DownVotes { get; set; }
        public int Score { get; set; }
    }
}
