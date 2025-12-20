using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using NervboxDeamon.DbModels;
using NervboxDeamon.Hubs;
using NervboxDeamon.Services.Interfaces;

namespace NervboxDeamon.Services
{
    public class CreditService : ICreditService, IDisposable
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<CreditService> _logger;
        private readonly IHubContext<SoundHub> _soundHub;
        private readonly IHubContext<ChatHub> _chatHub;
        private CreditSettings _cachedSettings;
        private readonly object _settingsLock = new object();
        private Timer _hourlyTimer;
        private bool _disposed;
        private static readonly Random _random = new Random();

        public CreditService(
            IServiceProvider serviceProvider,
            ILogger<CreditService> logger,
            IHubContext<SoundHub> soundHub,
            IHubContext<ChatHub> chatHub)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
            _soundHub = soundHub;
            _chatHub = chatHub;
        }

        public void Init()
        {
            EnsureDefaultSettings();
            _cachedSettings = LoadSettings();

            // Start hourly credit timer (check every minute, but only grant once per hour)
            _hourlyTimer = new Timer(
                callback: _ => ProcessHourlyCredits(),
                state: null,
                dueTime: TimeSpan.FromMinutes(1),
                period: TimeSpan.FromMinutes(5) // Check every 5 minutes
            );

            _logger.LogInformation("CreditService initialized");
        }

        private void EnsureDefaultSettings()
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();

            if (!db.CreditSettings.Any())
            {
                db.CreditSettings.Add(new CreditSettings());
                db.SaveChanges();
                _logger.LogInformation("Created default credit settings");
            }
        }

        private CreditSettings LoadSettings()
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();
            return db.CreditSettings.First();
        }

        public int GetUserCredits(int userId)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();
            var user = db.Users.Find(userId);
            return user?.Credits ?? 0;
        }

        public bool HasEnoughCredits(int userId, int amount)
        {
            return GetUserCredits(userId) >= amount;
        }

        public bool DeductCredits(int userId, int amount, CreditTransactionType type, string description, string relatedEntityId = null)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();

            var user = db.Users.Find(userId);
            if (user == null)
            {
                _logger.LogWarning($"User {userId} not found for credit deduction");
                return false;
            }

            // Admins have unlimited credits (but we still track for stats)
            if (user.Role == "admin")
            {
                // Just create transaction record but don't actually deduct
                var adminTransaction = new CreditTransaction
                {
                    UserId = userId,
                    Amount = -amount,
                    TransactionType = type,
                    Description = description,
                    BalanceAfter = user.Credits,
                    RelatedEntityId = relatedEntityId
                };
                db.CreditTransactions.Add(adminTransaction);
                db.SaveChanges();
                return true;
            }

            if (user.Credits < amount)
            {
                _logger.LogDebug($"User {userId} has insufficient credits ({user.Credits} < {amount})");
                return false;
            }

            user.Credits -= amount;
            var transaction = new CreditTransaction
            {
                UserId = userId,
                Amount = -amount,
                TransactionType = type,
                Description = description,
                BalanceAfter = user.Credits,
                RelatedEntityId = relatedEntityId
            };

            db.CreditTransactions.Add(transaction);
            db.SaveChanges();

            _logger.LogDebug($"Deducted {amount} credits from user {userId}. New balance: {user.Credits}");

            // Broadcast credit update via SignalR
            BroadcastCreditUpdate(userId, user.Credits);

            return true;
        }

        public void AddCredits(int userId, int amount, CreditTransactionType type, string description, string relatedEntityId = null)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();

            var user = db.Users.Find(userId);
            if (user == null)
            {
                _logger.LogWarning($"User {userId} not found for credit addition");
                return;
            }

            var settings = GetSettings();

            // For non-admins, cap at max credits
            if (user.Role != "admin")
            {
                var newBalance = user.Credits + amount;
                if (newBalance > settings.MaxCreditsUser)
                {
                    amount = settings.MaxCreditsUser - user.Credits;
                    if (amount <= 0)
                    {
                        _logger.LogDebug($"User {userId} already at max credits ({settings.MaxCreditsUser})");
                        return;
                    }
                }
            }

            user.Credits += amount;
            var transaction = new CreditTransaction
            {
                UserId = userId,
                Amount = amount,
                TransactionType = type,
                Description = description,
                BalanceAfter = user.Credits,
                RelatedEntityId = relatedEntityId
            };

            db.CreditTransactions.Add(transaction);
            db.SaveChanges();

            _logger.LogDebug($"Added {amount} credits to user {userId}. New balance: {user.Credits}");

            // Broadcast credit update via SignalR
            BroadcastCreditUpdate(userId, user.Credits);

            // Check achievements
            try
            {
                var achievementService = scope.ServiceProvider.GetService<IAchievementService>();
                if (achievementService != null)
                {
                    // Check admin gift achievement
                    if (type == CreditTransactionType.AdminGrant)
                    {
                        achievementService.CheckAdminCreditAchievement(userId);
                    }

                    // Check wealth achievements
                    achievementService.CheckWealthAchievements(userId, user.Credits);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"Failed to check credit achievements: {ex.Message}");
            }
        }

        public CreditSettings GetSettings()
        {
            lock (_settingsLock)
            {
                if (_cachedSettings == null)
                {
                    _cachedSettings = LoadSettings();
                }
                return _cachedSettings;
            }
        }

        public CreditSettings UpdateSettings(CreditSettings newSettings)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();

            var settings = db.CreditSettings.First();
            settings.InitialCreditsUser = newSettings.InitialCreditsUser;
            settings.InitialCreditsAdmin = newSettings.InitialCreditsAdmin;
            settings.CostPerSoundPlay = newSettings.CostPerSoundPlay;
            settings.HourlyCreditsEnabled = newSettings.HourlyCreditsEnabled;
            settings.HourlyCreditsAmount = newSettings.HourlyCreditsAmount;
            settings.MaxCreditsUser = newSettings.MaxCreditsUser;
            settings.MinCreditsToPlay = newSettings.MinCreditsToPlay;

            db.SaveChanges();

            lock (_settingsLock)
            {
                _cachedSettings = settings;
            }

            _logger.LogInformation("Credit settings updated");
            return settings;
        }

        public IEnumerable<CreditTransaction> GetTransactionHistory(int userId, int limit = 50)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();

            return db.CreditTransactions
                .Where(t => t.UserId == userId)
                .OrderByDescending(t => t.CreatedAt)
                .Take(limit)
                .ToList();
        }

        public void GrantInitialCredits(int userId, bool isAdmin)
        {
            var settings = GetSettings();
            var amount = isAdmin ? settings.InitialCreditsAdmin : settings.InitialCreditsUser;

            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();

            var user = db.Users.Find(userId);
            if (user == null) return;

            user.Credits = amount;
            var transaction = new CreditTransaction
            {
                UserId = userId,
                Amount = amount,
                TransactionType = CreditTransactionType.Initial,
                Description = "Initial credits upon registration",
                BalanceAfter = amount
            };

            db.CreditTransactions.Add(transaction);
            db.SaveChanges();

            _logger.LogInformation($"Granted {amount} initial credits to user {userId}");
        }

        public void ProcessHourlyCredits()
        {
            // Don't process if disposed
            if (_disposed)
            {
                return;
            }

            var settings = GetSettings();
            if (!settings.HourlyCreditsEnabled)
            {
                return;
            }

            try
            {
                // Double-check disposed state right before creating scope (race condition protection)
                if (_disposed)
                {
                    return;
                }

                using var scope = _serviceProvider.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();

                var oneHourAgo = DateTime.UtcNow.AddHours(-1);
                var eligibleUsers = db.Users
                    .Where(u => u.IsActive && u.Role != "admin")
                    .Where(u => u.LastCreditGrantAt == null || u.LastCreditGrantAt < oneHourAgo)
                    .Where(u => u.Credits < settings.MaxCreditsUser)
                    .ToList();

                foreach (var user in eligibleUsers)
                {
                    var amountToGrant = settings.HourlyCreditsAmount;
                    var newBalance = user.Credits + amountToGrant;
                    if (newBalance > settings.MaxCreditsUser)
                    {
                        amountToGrant = settings.MaxCreditsUser - user.Credits;
                    }

                    if (amountToGrant > 0)
                    {
                        user.Credits += amountToGrant;
                        user.LastCreditGrantAt = DateTime.UtcNow;

                        var transaction = new CreditTransaction
                        {
                            UserId = user.Id,
                            Amount = amountToGrant,
                            TransactionType = CreditTransactionType.HourlyBonus,
                            Description = "Hourly bonus credits",
                            BalanceAfter = user.Credits
                        };

                        db.CreditTransactions.Add(transaction);
                        BroadcastCreditUpdate(user.Id, user.Credits);
                    }
                }

                if (eligibleUsers.Any())
                {
                    db.SaveChanges();
                    _logger.LogDebug($"Granted hourly credits to {eligibleUsers.Count} users");
                }
            }
            catch (ObjectDisposedException)
            {
                // Service is shutting down, ignore
                _logger.LogDebug("Hourly credits processing skipped - service is disposing");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing hourly credits");
            }
        }

        public void AdminGrantCredits(int userId, int amount, string reason)
        {
            AddCredits(userId, amount, CreditTransactionType.AdminGrant, reason ?? "Admin grant");
        }

        public bool TryGrantHourlyCredits(int userId)
        {
            var settings = GetSettings();
            if (!settings.HourlyCreditsEnabled)
            {
                return false;
            }

            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();

            var user = db.Users.Find(userId);
            if (user == null || !user.IsActive || user.Role == "admin")
            {
                return false;
            }

            var oneHourAgo = DateTime.UtcNow.AddHours(-1);
            if (user.LastCreditGrantAt != null && user.LastCreditGrantAt >= oneHourAgo)
            {
                return false;
            }

            if (user.Credits >= settings.MaxCreditsUser)
            {
                return false;
            }

            var amountToGrant = settings.HourlyCreditsAmount;
            var newBalance = user.Credits + amountToGrant;
            if (newBalance > settings.MaxCreditsUser)
            {
                amountToGrant = settings.MaxCreditsUser - user.Credits;
            }

            if (amountToGrant > 0)
            {
                user.Credits += amountToGrant;
                user.LastCreditGrantAt = DateTime.UtcNow;

                var transaction = new CreditTransaction
                {
                    UserId = userId,
                    Amount = amountToGrant,
                    TransactionType = CreditTransactionType.HourlyBonus,
                    Description = "Hourly bonus credits",
                    BalanceAfter = user.Credits
                };

                db.CreditTransactions.Add(transaction);
                db.SaveChanges();

                _logger.LogDebug($"Granted {amountToGrant} hourly credits to user {userId}");
                BroadcastCreditUpdate(userId, user.Credits);
                return true;
            }

            return false;
        }

        private void BroadcastCreditUpdate(int userId, int newBalance)
        {
            try
            {
                _soundHub.Clients.All.SendAsync("creditUpdate", new
                {
                    UserId = userId,
                    Credits = newBalance,
                    Timestamp = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to broadcast credit update");
            }
        }

        private void BroadcastSystemChatMessage(string message, int? relatedUserId = null)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();

                // Get or create system user (userId = 0 or a dedicated system user)
                var systemUser = db.Users.FirstOrDefault(u => u.Username == "NERVBOX");
                if (systemUser == null)
                {
                    // Create system user if not exists
                    systemUser = new User
                    {
                        Username = "NERVBOX",
                        PasswordHash = Guid.NewGuid().ToString(), // Random unusable password
                        Role = "system",
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow
                    };
                    db.Users.Add(systemUser);
                    db.SaveChanges();
                }

                // Store in database
                var chatMessage = new ChatMessage
                {
                    UserId = systemUser.Id,
                    Message = message,
                    MessageType = ChatMessageType.ShekelTransaction,
                    CreatedAt = DateTime.UtcNow
                };
                db.ChatMessages.Add(chatMessage);
                db.SaveChanges();

                // Broadcast via SignalR
                _chatHub.Clients.All.SendAsync("message", new
                {
                    Id = chatMessage.Id,
                    UserId = systemUser.Id,
                    Username = "NERVBOX",
                    Message = message,
                    MessageType = "shekel-transaction",
                    GifUrl = (string)null,
                    CreatedAt = chatMessage.CreatedAt
                });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to broadcast system chat message");
            }
        }

        public (bool won, int newBalance, string message) Gamble(int userId, int amount)
        {
            if (amount <= 0)
            {
                return (false, 0, "Einsatz muss größer als 0 sein");
            }

            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();

            var user = db.Users.Find(userId);
            if (user == null)
            {
                return (false, 0, "Benutzer nicht gefunden");
            }

            if (user.Credits < amount)
            {
                return (false, user.Credits, "Nicht genug Shekel zum Gamblen");
            }

            // 50/50 chance
            bool won = _random.Next(2) == 1;

            if (won)
            {
                // Double the bet
                var settings = GetSettings();
                var winAmount = amount;
                var newBalance = user.Credits + winAmount;

                // Cap at max credits for non-admins
                if (user.Role != "admin" && newBalance > settings.MaxCreditsUser)
                {
                    winAmount = settings.MaxCreditsUser - user.Credits;
                    newBalance = settings.MaxCreditsUser;
                }

                user.Credits = newBalance;
                var transaction = new CreditTransaction
                {
                    UserId = userId,
                    Amount = winAmount,
                    TransactionType = CreditTransactionType.GambleWin,
                    Description = $"Gambling gewonnen: {amount} N$ eingesetzt, {winAmount} N$ gewonnen",
                    BalanceAfter = newBalance
                };
                db.CreditTransactions.Add(transaction);
                db.SaveChanges();

                BroadcastCreditUpdate(userId, newBalance);
                BroadcastSystemChatMessage($"🎰 {user.Username} hat beim Gamblen {amount} N$ eingesetzt und GEWONNEN! 💰 +{winAmount} N$ 🎉");

                _logger.LogInformation($"User {userId} won gambling: bet {amount}, won {winAmount}");
                return (true, newBalance, $"JACKPOT! Du hast {winAmount} N$ gewonnen!");
            }
            else
            {
                // Lose everything
                user.Credits -= amount;
                var transaction = new CreditTransaction
                {
                    UserId = userId,
                    Amount = -amount,
                    TransactionType = CreditTransactionType.GambleLoss,
                    Description = $"Gambling verloren: {amount} N$ eingesetzt",
                    BalanceAfter = user.Credits
                };
                db.CreditTransactions.Add(transaction);
                db.SaveChanges();

                BroadcastCreditUpdate(userId, user.Credits);
                BroadcastSystemChatMessage($"🎰 {user.Username} hat beim Gamblen {amount} N$ verzockt! 💸 Alles weg! 😂");

                _logger.LogInformation($"User {userId} lost gambling: bet {amount}");
                return (false, user.Credits, $"Pech gehabt! {amount} N$ verloren. Das Haus gewinnt immer!");
            }
        }

        public (bool success, string message) TransferCredits(int fromUserId, int toUserId, int amount)
        {
            if (amount <= 0)
            {
                return (false, "Betrag muss größer als 0 sein");
            }

            if (fromUserId == toUserId)
            {
                return (false, "Du kannst dir nicht selbst Shekel senden");
            }

            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();

            var fromUser = db.Users.Find(fromUserId);
            var toUser = db.Users.Find(toUserId);

            if (fromUser == null)
            {
                return (false, "Sender nicht gefunden");
            }

            if (toUser == null)
            {
                return (false, "Empfänger nicht gefunden");
            }

            if (!toUser.IsActive)
            {
                return (false, "Empfänger ist nicht aktiv");
            }

            if (fromUser.Credits < amount)
            {
                return (false, "Nicht genug Shekel zum Senden");
            }

            var settings = GetSettings();

            // Deduct from sender
            fromUser.Credits -= amount;
            var senderTransaction = new CreditTransaction
            {
                UserId = fromUserId,
                Amount = -amount,
                TransactionType = CreditTransactionType.TransferSent,
                Description = $"Shekel an {toUser.Username} gesendet",
                BalanceAfter = fromUser.Credits,
                RelatedEntityId = toUserId.ToString()
            };
            db.CreditTransactions.Add(senderTransaction);

            // Add to receiver (respect max credits)
            var amountToAdd = amount;
            if (toUser.Role != "admin")
            {
                var newBalance = toUser.Credits + amount;
                if (newBalance > settings.MaxCreditsUser)
                {
                    amountToAdd = settings.MaxCreditsUser - toUser.Credits;
                    if (amountToAdd <= 0)
                    {
                        return (false, $"{toUser.Username} hat bereits das Maximum an Shekel");
                    }
                }
            }

            toUser.Credits += amountToAdd;
            var receiverTransaction = new CreditTransaction
            {
                UserId = toUserId,
                Amount = amountToAdd,
                TransactionType = CreditTransactionType.TransferReceived,
                Description = $"Shekel von {fromUser.Username} erhalten",
                BalanceAfter = toUser.Credits,
                RelatedEntityId = fromUserId.ToString()
            };
            db.CreditTransactions.Add(receiverTransaction);

            db.SaveChanges();

            // Broadcast updates
            BroadcastCreditUpdate(fromUserId, fromUser.Credits);
            BroadcastCreditUpdate(toUserId, toUser.Credits);
            BroadcastSystemChatMessage($"💸 {fromUser.Username} hat {amount} N$ an {toUser.Username} gesendet! 🤝");

            _logger.LogInformation($"User {fromUserId} transferred {amount} credits to user {toUserId}");

            if (amountToAdd < amount)
            {
                return (true, $"{amount} N$ an {toUser.Username} gesendet. {toUser.Username} konnte nur {amountToAdd} N$ empfangen (Maximum erreicht).");
            }

            return (true, $"{amount} N$ an {toUser.Username} gesendet!");
        }

        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;

            // Stop the timer first (prevent new callbacks)
            if (_hourlyTimer != null)
            {
                // Disable the timer before disposing
                _hourlyTimer.Change(Timeout.Infinite, Timeout.Infinite);
                _hourlyTimer.Dispose();
                _hourlyTimer = null;
            }

            _logger.LogInformation("CreditService disposed");
        }
    }
}
