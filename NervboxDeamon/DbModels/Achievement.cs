using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace NervboxDeamon.DbModels
{
    /// <summary>
    /// Achievement categories for grouping and filtering
    /// </summary>
    public enum AchievementCategory
    {
        General,        // Registration, tour, etc.
        SoundPlayback,  // Playing sounds
        SoundCreation,  // Creating/uploading sounds
        MiniGames,      // Playing mini-games
        Gambling,       // Gambling achievements
        Chat,           // Chat-related
        Social,         // Money transfer, favorites, etc.
        Wealth          // Credit milestones
    }

    /// <summary>
    /// Defines all possible achievements in the system
    /// </summary>
    [Table("achievements")]
    public class Achievement
    {
        [Key]
        [Column("id")]
        public string Id { get; set; }

        [Required]
        [Column("name")]
        public string Name { get; set; }

        [Required]
        [Column("description")]
        public string Description { get; set; }

        [Column("icon")]
        public string Icon { get; set; }

        [Column("category")]
        public AchievementCategory Category { get; set; }

        /// <summary>
        /// For tiered achievements (e.g., 10, 100, 1000 plays), indicates the tier level
        /// </summary>
        [Column("tier")]
        public int Tier { get; set; } = 0;

        /// <summary>
        /// For tiered achievements, the threshold required
        /// </summary>
        [Column("threshold")]
        public int Threshold { get; set; } = 0;

        /// <summary>
        /// Display order within category
        /// </summary>
        [Column("sort_order")]
        public int SortOrder { get; set; } = 0;

        /// <summary>
        /// Whether this achievement is currently active/earnable
        /// </summary>
        [Column("is_active")]
        public bool IsActive { get; set; } = true;

        /// <summary>
        /// Optional: Credit reward for earning this achievement
        /// </summary>
        [Column("reward_credits")]
        public int RewardCredits { get; set; } = 0;

        [JsonIgnore]
        public virtual ICollection<UserAchievement> UserAchievements { get; set; } = new List<UserAchievement>();
    }
}
