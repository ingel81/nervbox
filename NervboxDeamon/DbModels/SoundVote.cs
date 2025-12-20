using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace NervboxDeamon.DbModels
{
    [Table("sound_votes")]
    public class SoundVote
    {
        [Column("user_id")]
        public int UserId { get; set; }

        [Column("sound_hash")]
        public string SoundHash { get; set; }

        /// <summary>
        /// +1 = Upvote, -1 = Downvote
        /// </summary>
        [Column("vote_value")]
        public int VoteValue { get; set; }

        [Column("voted_at")]
        public DateTime VotedAt { get; set; } = DateTime.UtcNow;

        [Column("updated_at")]
        public DateTime? UpdatedAt { get; set; }

        // Navigation Properties
        public virtual User User { get; set; }
        public virtual Sound Sound { get; set; }
    }
}
