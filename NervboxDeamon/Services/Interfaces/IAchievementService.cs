using System.Collections.Generic;
using NervboxDeamon.DbModels;

namespace NervboxDeamon.Services.Interfaces
{
    public interface IAchievementService
    {
        /// <summary>
        /// Initialize the achievement service (seed default achievements)
        /// </summary>
        void Init();

        /// <summary>
        /// Get all available achievements
        /// </summary>
        IEnumerable<Achievement> GetAllAchievements();

        /// <summary>
        /// Get achievements for a specific category
        /// </summary>
        IEnumerable<Achievement> GetAchievementsByCategory(AchievementCategory category);

        /// <summary>
        /// Get all achievements earned by a user
        /// </summary>
        IEnumerable<UserAchievement> GetUserAchievements(int userId);

        /// <summary>
        /// Check if user has a specific achievement
        /// </summary>
        bool HasAchievement(int userId, string achievementId);

        /// <summary>
        /// Grant an achievement to a user (returns true if newly granted)
        /// </summary>
        bool GrantAchievement(int userId, string achievementId, int progressValue = 0);

        /// <summary>
        /// Check and grant achievements based on user registration
        /// </summary>
        void CheckRegistrationAchievements(int userId);

        /// <summary>
        /// Check and grant achievements based on guided tour completion
        /// </summary>
        void CheckTourCompletedAchievement(int userId);

        /// <summary>
        /// Check and grant achievements based on sound play counts
        /// </summary>
        void CheckSoundPlayAchievements(int userId, int totalPlays);

        /// <summary>
        /// Check and grant achievements based on mixer usage
        /// </summary>
        void CheckMixerAchievements(int userId, bool visitedMixer, bool createdSound);

        /// <summary>
        /// Check and grant achievements when someone favorites the user's created sound
        /// </summary>
        void CheckSoundFavoritedAchievement(int authorUserId);

        /// <summary>
        /// Check and grant achievements based on minigame play counts
        /// </summary>
        void CheckMinigameAchievements(int userId, int totalGamesPlayed);

        /// <summary>
        /// Check and grant achievements based on gambling results
        /// </summary>
        void CheckGamblingAchievements(int userId, bool won, int amount);

        /// <summary>
        /// Check and grant achievements based on chat activity
        /// </summary>
        void CheckChatAchievements(int userId, int messageCount, bool sentGif);

        /// <summary>
        /// Check and grant achievements based on credit transfers
        /// </summary>
        void CheckTransferAchievements(int userId, bool sentMoney, bool receivedMoney);

        /// <summary>
        /// Check and grant achievements based on credit balance
        /// </summary>
        void CheckWealthAchievements(int userId, int currentBalance);

        /// <summary>
        /// Check and grant achievement when receiving credits from admin
        /// </summary>
        void CheckAdminCreditAchievement(int userId);

        /// <summary>
        /// Get progress towards tiered achievements (for display)
        /// </summary>
        Dictionary<string, AchievementProgress> GetUserProgress(int userId);
    }

    /// <summary>
    /// Represents progress towards a tiered achievement
    /// </summary>
    public class AchievementProgress
    {
        public string AchievementId { get; set; }
        public int CurrentValue { get; set; }
        public int NextThreshold { get; set; }
        public bool IsCompleted { get; set; }
    }
}
