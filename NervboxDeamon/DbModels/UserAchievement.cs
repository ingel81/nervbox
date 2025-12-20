using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace NervboxDeamon.DbModels
{
    /// <summary>
    /// Tracks which achievements a user has earned
    /// </summary>
    [Table("user_achievements")]
    public class UserAchievement
    {
        [Column("user_id")]
        public int UserId { get; set; }

        [Column("achievement_id")]
        public string AchievementId { get; set; }

        [Column("earned_at")]
        public DateTime EarnedAt { get; set; } = DateTime.UtcNow;

        /// <summary>
        /// For tiered achievements, stores the current progress value when earned
        /// </summary>
        [Column("progress_value")]
        public int ProgressValue { get; set; } = 0;

        // Navigation properties
        public virtual User User { get; set; }
        public virtual Achievement Achievement { get; set; }
    }
}
