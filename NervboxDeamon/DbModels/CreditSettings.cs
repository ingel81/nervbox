using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace NervboxDeamon.DbModels
{
    [Table("credit_settings")]
    public class CreditSettings
    {
        [Key]
        [Column("id")]
        public int Id { get; set; }

        /// <summary>
        /// Initial credits for new regular users
        /// </summary>
        [Column("initial_credits_user")]
        public int InitialCreditsUser { get; set; } = 50;

        /// <summary>
        /// Initial credits for admin users (essentially unlimited)
        /// </summary>
        [Column("initial_credits_admin")]
        public int InitialCreditsAdmin { get; set; } = 999999999;

        /// <summary>
        /// Cost per sound play
        /// </summary>
        [Column("cost_per_sound_play")]
        public int CostPerSoundPlay { get; set; } = 1;

        /// <summary>
        /// Whether hourly credit grants are enabled
        /// </summary>
        [Column("hourly_credits_enabled")]
        public bool HourlyCreditsEnabled { get; set; } = true;

        /// <summary>
        /// Amount of credits granted per hour
        /// </summary>
        [Column("hourly_credits_amount")]
        public int HourlyCreditsAmount { get; set; } = 5;

        /// <summary>
        /// Maximum credits a regular user can have (admins have no limit)
        /// </summary>
        [Column("max_credits_user")]
        public int MaxCreditsUser { get; set; } = 999999;

        /// <summary>
        /// Minimum credits required to play a sound (if user has less, they cannot play)
        /// </summary>
        [Column("min_credits_to_play")]
        public int MinCreditsToPlay { get; set; } = 1;
    }
}
