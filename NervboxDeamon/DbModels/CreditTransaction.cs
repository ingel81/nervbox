using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace NervboxDeamon.DbModels
{
    public enum CreditTransactionType
    {
        Initial,        // Initial credits when account created
        SoundPlay,      // Deducted for playing a sound
        HourlyBonus,    // Hourly credit grant
        GameReward,     // Reward from mini-games (level completion)
        AchievementReward, // Reward from earning an achievement
        AdminGrant,     // Admin manually granted credits
        AdminDeduct,    // Admin manually deducted credits
        GambleWin,      // Won credits from gambling
        GambleLoss,     // Lost credits from gambling
        TransferSent,   // Sent credits to another user
        TransferReceived, // Received credits from another user
        SoundUpvoteReceived // Received credits when own sound got upvoted
    }

    [Table("credit_transactions")]
    public class CreditTransaction
    {
        [Key]
        [Column("id")]
        public int Id { get; set; }

        [Column("user_id")]
        public int UserId { get; set; }

        /// <summary>
        /// Positive = credit, Negative = debit
        /// </summary>
        [Column("amount")]
        public int Amount { get; set; }

        [Column("transaction_type")]
        public CreditTransactionType TransactionType { get; set; }

        [Column("description")]
        public string Description { get; set; }

        [Column("balance_after")]
        public int BalanceAfter { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [Column("related_entity_id")]
        public string RelatedEntityId { get; set; }

        // Navigation property
        public virtual User User { get; set; }
    }
}
