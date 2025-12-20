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
    }
}
