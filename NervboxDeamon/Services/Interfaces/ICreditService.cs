using System.Collections.Generic;
using NervboxDeamon.DbModels;

namespace NervboxDeamon.Services.Interfaces
{
    public interface ICreditService
    {
        /// <summary>
        /// Initialize the credit service (ensure default settings exist)
        /// </summary>
        void Init();

        /// <summary>
        /// Get current credit balance for a user
        /// </summary>
        int GetUserCredits(int userId);

        /// <summary>
        /// Check if user has enough credits
        /// </summary>
        bool HasEnoughCredits(int userId, int amount);

        /// <summary>
        /// Deduct credits from user (returns false if not enough credits)
        /// </summary>
        bool DeductCredits(int userId, int amount, CreditTransactionType type, string description, string relatedEntityId = null);

        /// <summary>
        /// Add credits to user
        /// </summary>
        void AddCredits(int userId, int amount, CreditTransactionType type, string description, string relatedEntityId = null);

        /// <summary>
        /// Get credit settings
        /// </summary>
        CreditSettings GetSettings();

        /// <summary>
        /// Update credit settings (admin only)
        /// </summary>
        CreditSettings UpdateSettings(CreditSettings settings);

        /// <summary>
        /// Get transaction history for a user
        /// </summary>
        IEnumerable<CreditTransaction> GetTransactionHistory(int userId, int limit = 50);

        /// <summary>
        /// Grant initial credits to a new user
        /// </summary>
        void GrantInitialCredits(int userId, bool isAdmin);

        /// <summary>
        /// Process hourly credit grants for all eligible users
        /// </summary>
        void ProcessHourlyCredits();

        /// <summary>
        /// Grant credits to a user (admin action)
        /// </summary>
        void AdminGrantCredits(int userId, int amount, string reason);

        /// <summary>
        /// Check and grant hourly credits to a specific user if eligible
        /// </summary>
        bool TryGrantHourlyCredits(int userId);

        /// <summary>
        /// Gamble credits - 50/50 chance to double or lose all
        /// </summary>
        (bool won, int newBalance, string message) Gamble(int userId, int amount);

        /// <summary>
        /// Transfer credits from one user to another
        /// </summary>
        (bool success, string message) TransferCredits(int fromUserId, int toUserId, int amount);

        /// <summary>
        /// Claim reward for completing a minigame level
        /// Formula: 5 * 2^(level-1) = 5, 10, 20, 40, ...
        /// </summary>
        (int reward, int newBalance) ClaimMinigameReward(int userId, string gameName, int level);

        /// <summary>
        /// Process Plinko game result - deduct bet and add winnings
        /// </summary>
        (int newBalance, string message) ProcessPlinko(int userId, int amount, decimal multiplier);
    }
}
