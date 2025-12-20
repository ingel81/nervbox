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
        GameReward,     // Reward from mini-games
        AdminGrant,     // Admin manually granted credits
        AdminDeduct     // Admin manually deducted credits
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
