using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using NervboxDeamon.DbModels;
using NervboxDeamon.Hubs;
using NervboxDeamon.Services.Interfaces;

namespace NervboxDeamon.Services
{
    public class AchievementService : IAchievementService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<AchievementService> _logger;
        private readonly IHubContext<SoundHub> _soundHub;
        private readonly ICreditService _creditService;
        private Dictionary<string, Achievement> _achievementCache;
        private readonly object _cacheLock = new object();

        // Achievement IDs as constants for easy reference
        public static class AchievementIds
        {
            // General
            public const string Registered = "registered";
            public const string TourCompleted = "tour_completed";

            // Sound Playback
            public const string FirstSound = "sound_play_1";
            public const string Sounds10 = "sound_play_10";
            public const string Sounds100 = "sound_play_100";
            public const string Sounds1000 = "sound_play_1000";
            public const string Sounds5000 = "sound_play_5000";

            // Mixer
            public const string MixerVisited = "mixer_visited";
            public const string MixerCreated = "mixer_created";
            public const string SoundFavorited = "sound_favorited";

            // Minigames
            public const string Minigame1 = "minigame_1";
            public const string Minigame5 = "minigame_5";
            public const string Minigame25 = "minigame_25";
            public const string Minigame100 = "minigame_100";

            // Gambling
            public const string GamblingWon = "gambling_won";
            public const string GamblingLostAll = "gambling_lost_all";

            // Chat
            public const string ChatFirst = "chat_first";
            public const string ChatGif = "chat_gif";
            public const string Chat100 = "chat_100";

            // Social
            public const string MoneySent = "money_sent";
            public const string MoneyReceived = "money_received";

            // Wealth
            public const string Wealth500 = "wealth_500";
            public const string Wealth1000 = "wealth_1000";

            // Admin
            public const string AdminGift = "admin_gift";
        }

        public AchievementService(
            IServiceProvider serviceProvider,
            ILogger<AchievementService> logger,
            IHubContext<SoundHub> soundHub,
            ICreditService creditService)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
            _soundHub = soundHub;
            _creditService = creditService;
        }

        public void Init()
        {
            SeedAchievements();
            _achievementCache = LoadAchievements();
            _logger.LogInformation("AchievementService initialized with {Count} achievements", _achievementCache.Count);
        }

        private void SeedAchievements()
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();

            var existingIds = db.Achievements.Select(a => a.Id).ToHashSet();
            var achievements = GetDefaultAchievements();
            var newAchievements = achievements.Where(a => !existingIds.Contains(a.Id)).ToList();

            if (newAchievements.Any())
            {
                db.Achievements.AddRange(newAchievements);
                db.SaveChanges();
                _logger.LogInformation("Seeded {Count} new achievements", newAchievements.Count);
            }
        }

        private List<Achievement> GetDefaultAchievements()
        {
            return new List<Achievement>
            {
                // General
                new Achievement
                {
                    Id = AchievementIds.Registered,
                    Name = "Willkommen!",
                    Description = "Du hast dich bei der Nervbox registriert",
                    Icon = "person_add",
                    Category = AchievementCategory.General,
                    SortOrder = 1,
                    RewardCredits = 5
                },
                new Achievement
                {
                    Id = AchievementIds.TourCompleted,
                    Name = "Entdecker",
                    Description = "Du hast die Guided Tour abgeschlossen",
                    Icon = "explore",
                    Category = AchievementCategory.General,
                    SortOrder = 2,
                    RewardCredits = 10
                },

                // Sound Playback
                new Achievement
                {
                    Id = AchievementIds.FirstSound,
                    Name = "Erster Ton",
                    Description = "Du hast deinen ersten Sound abgespielt",
                    Icon = "play_circle",
                    Category = AchievementCategory.SoundPlayback,
                    Tier = 1,
                    Threshold = 1,
                    SortOrder = 1,
                    RewardCredits = 5
                },
                new Achievement
                {
                    Id = AchievementIds.Sounds10,
                    Name = "Sound-Fan",
                    Description = "Du hast 10 Sounds abgespielt",
                    Icon = "music_note",
                    Category = AchievementCategory.SoundPlayback,
                    Tier = 2,
                    Threshold = 10,
                    SortOrder = 2,
                    RewardCredits = 10
                },
                new Achievement
                {
                    Id = AchievementIds.Sounds100,
                    Name = "Sound-Enthusiast",
                    Description = "Du hast 100 Sounds abgespielt",
                    Icon = "library_music",
                    Category = AchievementCategory.SoundPlayback,
                    Tier = 3,
                    Threshold = 100,
                    SortOrder = 3,
                    RewardCredits = 25
                },
                new Achievement
                {
                    Id = AchievementIds.Sounds1000,
                    Name = "Sound-Meister",
                    Description = "Du hast 1.000 Sounds abgespielt",
                    Icon = "queue_music",
                    Category = AchievementCategory.SoundPlayback,
                    Tier = 4,
                    Threshold = 1000,
                    SortOrder = 4,
                    RewardCredits = 50
                },
                new Achievement
                {
                    Id = AchievementIds.Sounds5000,
                    Name = "Sound-Legende",
                    Description = "Du hast 5.000 Sounds abgespielt",
                    Icon = "star",
                    Category = AchievementCategory.SoundPlayback,
                    Tier = 5,
                    Threshold = 5000,
                    SortOrder = 5,
                    RewardCredits = 100
                },

                // Mixer
                new Achievement
                {
                    Id = AchievementIds.MixerVisited,
                    Name = "Neugierig",
                    Description = "Du hast den Mixer besucht",
                    Icon = "tune",
                    Category = AchievementCategory.SoundCreation,
                    SortOrder = 1,
                    RewardCredits = 5
                },
                new Achievement
                {
                    Id = AchievementIds.MixerCreated,
                    Name = "Kreativ",
                    Description = "Du hast einen Sound im Mixer erstellt und hochgeladen",
                    Icon = "add_circle",
                    Category = AchievementCategory.SoundCreation,
                    SortOrder = 2,
                    RewardCredits = 25
                },
                new Achievement
                {
                    Id = AchievementIds.SoundFavorited,
                    Name = "Beliebt",
                    Description = "Jemand hat deinen erstellten Sound favorisiert",
                    Icon = "favorite",
                    Category = AchievementCategory.SoundCreation,
                    SortOrder = 3,
                    RewardCredits = 15
                },

                // Minigames
                new Achievement
                {
                    Id = AchievementIds.Minigame1,
                    Name = "Spieler",
                    Description = "Du hast dein erstes Minispiel gespielt",
                    Icon = "sports_esports",
                    Category = AchievementCategory.MiniGames,
                    Tier = 1,
                    Threshold = 1,
                    SortOrder = 1,
                    RewardCredits = 5
                },
                new Achievement
                {
                    Id = AchievementIds.Minigame5,
                    Name = "Gelegenheitsspieler",
                    Description = "Du hast 5 Minispiele gespielt",
                    Icon = "videogame_asset",
                    Category = AchievementCategory.MiniGames,
                    Tier = 2,
                    Threshold = 5,
                    SortOrder = 2,
                    RewardCredits = 10
                },
                new Achievement
                {
                    Id = AchievementIds.Minigame25,
                    Name = "Dauerspieler",
                    Description = "Du hast 25 Minispiele gespielt",
                    Icon = "casino",
                    Category = AchievementCategory.MiniGames,
                    Tier = 3,
                    Threshold = 25,
                    SortOrder = 3,
                    RewardCredits = 25
                },
                new Achievement
                {
                    Id = AchievementIds.Minigame100,
                    Name = "Spielsüchtig",
                    Description = "Du hast 100 Minispiele gespielt",
                    Icon = "emoji_events",
                    Category = AchievementCategory.MiniGames,
                    Tier = 4,
                    Threshold = 100,
                    SortOrder = 4,
                    RewardCredits = 50
                },

                // Gambling
                new Achievement
                {
                    Id = AchievementIds.GamblingWon,
                    Name = "Glückspilz",
                    Description = "Du hast beim Glücksspiel gewonnen",
                    Icon = "attach_money",
                    Category = AchievementCategory.Gambling,
                    SortOrder = 1,
                    RewardCredits = 10
                },
                new Achievement
                {
                    Id = AchievementIds.GamblingLostAll,
                    Name = "Pleite",
                    Description = "Du hast alles beim Glücksspiel verloren",
                    Icon = "money_off",
                    Category = AchievementCategory.Gambling,
                    SortOrder = 2,
                    RewardCredits = 5
                },

                // Chat
                new Achievement
                {
                    Id = AchievementIds.ChatFirst,
                    Name = "Gesprächig",
                    Description = "Du hast deine erste Chat-Nachricht geschrieben",
                    Icon = "chat_bubble",
                    Category = AchievementCategory.Chat,
                    Tier = 1,
                    Threshold = 1,
                    SortOrder = 1,
                    RewardCredits = 5
                },
                new Achievement
                {
                    Id = AchievementIds.ChatGif,
                    Name = "GIF-Master",
                    Description = "Du hast ein GIF im Chat gesendet",
                    Icon = "gif",
                    Category = AchievementCategory.Chat,
                    SortOrder = 2,
                    RewardCredits = 5
                },
                new Achievement
                {
                    Id = AchievementIds.Chat100,
                    Name = "Vielschreiber",
                    Description = "Du hast 100 Chat-Nachrichten geschrieben",
                    Icon = "forum",
                    Category = AchievementCategory.Chat,
                    Tier = 2,
                    Threshold = 100,
                    SortOrder = 3,
                    RewardCredits = 25
                },

                // Social
                new Achievement
                {
                    Id = AchievementIds.MoneySent,
                    Name = "Großzügig",
                    Description = "Du hast einem anderen User N$ gesendet",
                    Icon = "send",
                    Category = AchievementCategory.Social,
                    SortOrder = 1,
                    RewardCredits = 10
                },
                new Achievement
                {
                    Id = AchievementIds.MoneyReceived,
                    Name = "Beschenkt",
                    Description = "Du hast N$ von einem anderen User erhalten",
                    Icon = "redeem",
                    Category = AchievementCategory.Social,
                    SortOrder = 2,
                    RewardCredits = 5
                },

                // Wealth
                new Achievement
                {
                    Id = AchievementIds.Wealth500,
                    Name = "Wohlhabend",
                    Description = "Du hattest mehr als 500 N$",
                    Icon = "savings",
                    Category = AchievementCategory.Wealth,
                    Tier = 1,
                    Threshold = 500,
                    SortOrder = 1,
                    RewardCredits = 0
                },
                new Achievement
                {
                    Id = AchievementIds.Wealth1000,
                    Name = "Reich",
                    Description = "Du hattest mehr als 1.000 N$",
                    Icon = "account_balance",
                    Category = AchievementCategory.Wealth,
                    Tier = 2,
                    Threshold = 1000,
                    SortOrder = 2,
                    RewardCredits = 0
                },

                // Admin
                new Achievement
                {
                    Id = AchievementIds.AdminGift,
                    Name = "Auserwählt",
                    Description = "Du hast N$ von einem Admin erhalten",
                    Icon = "card_giftcard",
                    Category = AchievementCategory.Social,
                    SortOrder = 3,
                    RewardCredits = 0
                }
            };
        }

        private Dictionary<string, Achievement> LoadAchievements()
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();
            return db.Achievements.ToDictionary(a => a.Id);
        }

        public IEnumerable<Achievement> GetAllAchievements()
        {
            lock (_cacheLock)
            {
                if (_achievementCache == null)
                {
                    _achievementCache = LoadAchievements();
                }
                return _achievementCache.Values.Where(a => a.IsActive).OrderBy(a => a.Category).ThenBy(a => a.SortOrder).ToList();
            }
        }

        public IEnumerable<Achievement> GetAchievementsByCategory(AchievementCategory category)
        {
            return GetAllAchievements().Where(a => a.Category == category);
        }

        public IEnumerable<UserAchievement> GetUserAchievements(int userId)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();

            return db.UserAchievements
                .Where(ua => ua.UserId == userId)
                .OrderByDescending(ua => ua.EarnedAt)
                .ToList();
        }

        public bool HasAchievement(int userId, string achievementId)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();
            return db.UserAchievements.Any(ua => ua.UserId == userId && ua.AchievementId == achievementId);
        }

        public bool GrantAchievement(int userId, string achievementId, int progressValue = 0)
        {
            if (HasAchievement(userId, achievementId))
            {
                return false; // Already has this achievement
            }

            lock (_cacheLock)
            {
                if (!_achievementCache.TryGetValue(achievementId, out var achievement))
                {
                    _logger.LogWarning("Achievement {AchievementId} not found", achievementId);
                    return false;
                }

                using var scope = _serviceProvider.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();

                var userAchievement = new UserAchievement
                {
                    UserId = userId,
                    AchievementId = achievementId,
                    EarnedAt = DateTime.UtcNow,
                    ProgressValue = progressValue
                };

                db.UserAchievements.Add(userAchievement);
                db.SaveChanges();

                _logger.LogInformation("User {UserId} earned achievement {AchievementId}", userId, achievementId);

                // Grant reward credits if any
                if (achievement.RewardCredits > 0)
                {
                    _creditService.AddCredits(userId, achievement.RewardCredits,
                        CreditTransactionType.GameReward,
                        $"Achievement: {achievement.Name}",
                        achievementId);
                }

                // Broadcast achievement earned via SignalR
                BroadcastAchievementEarned(userId, achievement);

                return true;
            }
        }

        private void BroadcastAchievementEarned(int userId, Achievement achievement)
        {
            try
            {
                _soundHub.Clients.All.SendAsync("achievementEarned", new
                {
                    UserId = userId,
                    Achievement = new
                    {
                        achievement.Id,
                        achievement.Name,
                        achievement.Description,
                        achievement.Icon,
                        achievement.Category,
                        achievement.RewardCredits
                    },
                    Timestamp = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to broadcast achievement earned");
            }
        }

        public void CheckRegistrationAchievements(int userId)
        {
            GrantAchievement(userId, AchievementIds.Registered);
        }

        public void CheckTourCompletedAchievement(int userId)
        {
            GrantAchievement(userId, AchievementIds.TourCompleted);
        }

        public void CheckSoundPlayAchievements(int userId, int totalPlays)
        {
            if (totalPlays >= 1)
                GrantAchievement(userId, AchievementIds.FirstSound, totalPlays);
            if (totalPlays >= 10)
                GrantAchievement(userId, AchievementIds.Sounds10, totalPlays);
            if (totalPlays >= 100)
                GrantAchievement(userId, AchievementIds.Sounds100, totalPlays);
            if (totalPlays >= 1000)
                GrantAchievement(userId, AchievementIds.Sounds1000, totalPlays);
            if (totalPlays >= 5000)
                GrantAchievement(userId, AchievementIds.Sounds5000, totalPlays);
        }

        public void CheckMixerAchievements(int userId, bool visitedMixer, bool createdSound)
        {
            if (visitedMixer)
                GrantAchievement(userId, AchievementIds.MixerVisited);
            if (createdSound)
                GrantAchievement(userId, AchievementIds.MixerCreated);
        }

        public void CheckSoundFavoritedAchievement(int authorUserId)
        {
            GrantAchievement(authorUserId, AchievementIds.SoundFavorited);
        }

        public void CheckMinigameAchievements(int userId, int totalGamesPlayed)
        {
            if (totalGamesPlayed >= 1)
                GrantAchievement(userId, AchievementIds.Minigame1, totalGamesPlayed);
            if (totalGamesPlayed >= 5)
                GrantAchievement(userId, AchievementIds.Minigame5, totalGamesPlayed);
            if (totalGamesPlayed >= 25)
                GrantAchievement(userId, AchievementIds.Minigame25, totalGamesPlayed);
            if (totalGamesPlayed >= 100)
                GrantAchievement(userId, AchievementIds.Minigame100, totalGamesPlayed);
        }

        public void CheckGamblingAchievements(int userId, bool won, int amount)
        {
            if (won && amount > 0)
                GrantAchievement(userId, AchievementIds.GamblingWon, amount);

            // Check if user lost all credits
            var currentBalance = _creditService.GetUserCredits(userId);
            if (!won && currentBalance == 0)
                GrantAchievement(userId, AchievementIds.GamblingLostAll);
        }

        public void CheckChatAchievements(int userId, int messageCount, bool sentGif)
        {
            if (messageCount >= 1)
                GrantAchievement(userId, AchievementIds.ChatFirst, messageCount);
            if (sentGif)
                GrantAchievement(userId, AchievementIds.ChatGif);
            if (messageCount >= 100)
                GrantAchievement(userId, AchievementIds.Chat100, messageCount);
        }

        public void CheckTransferAchievements(int userId, bool sentMoney, bool receivedMoney)
        {
            if (sentMoney)
                GrantAchievement(userId, AchievementIds.MoneySent);
            if (receivedMoney)
                GrantAchievement(userId, AchievementIds.MoneyReceived);
        }

        public void CheckWealthAchievements(int userId, int currentBalance)
        {
            if (currentBalance >= 500)
                GrantAchievement(userId, AchievementIds.Wealth500, currentBalance);
            if (currentBalance >= 1000)
                GrantAchievement(userId, AchievementIds.Wealth1000, currentBalance);
        }

        public void CheckAdminCreditAchievement(int userId)
        {
            GrantAchievement(userId, AchievementIds.AdminGift);
        }

        public Dictionary<string, AchievementProgress> GetUserProgress(int userId)
        {
            var progress = new Dictionary<string, AchievementProgress>();

            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();

            // Get user's earned achievements
            var earnedAchievements = db.UserAchievements
                .Where(ua => ua.UserId == userId)
                .ToDictionary(ua => ua.AchievementId, ua => ua.ProgressValue);

            // Get sound play count
            var soundPlayCount = db.SoundUsages.Count(su => su.UserId == userId);

            // Get chat message count
            var chatMessageCount = db.ChatMessages.Count(cm => cm.UserId == userId);

            // Get current balance
            var user = db.Users.Find(userId);
            var currentBalance = user?.Credits ?? 0;

            // Sound play progress
            var soundTiers = new[] { (AchievementIds.FirstSound, 1), (AchievementIds.Sounds10, 10),
                (AchievementIds.Sounds100, 100), (AchievementIds.Sounds1000, 1000), (AchievementIds.Sounds5000, 5000) };
            AddTieredProgress(progress, soundTiers, soundPlayCount, earnedAchievements, "sound_play");

            // Chat progress
            var chatTiers = new[] { (AchievementIds.ChatFirst, 1), (AchievementIds.Chat100, 100) };
            AddTieredProgress(progress, chatTiers, chatMessageCount, earnedAchievements, "chat");

            // Wealth progress
            var wealthTiers = new[] { (AchievementIds.Wealth500, 500), (AchievementIds.Wealth1000, 1000) };
            AddTieredProgress(progress, wealthTiers, currentBalance, earnedAchievements, "wealth");

            return progress;
        }

        private void AddTieredProgress(
            Dictionary<string, AchievementProgress> progress,
            (string id, int threshold)[] tiers,
            int currentValue,
            Dictionary<string, int> earnedAchievements,
            string prefix)
        {
            foreach (var (id, threshold) in tiers)
            {
                var isCompleted = earnedAchievements.ContainsKey(id);
                progress[id] = new AchievementProgress
                {
                    AchievementId = id,
                    CurrentValue = currentValue,
                    NextThreshold = threshold,
                    IsCompleted = isCompleted
                };
            }
        }
    }
}
