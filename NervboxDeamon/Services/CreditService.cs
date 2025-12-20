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
    public class CreditService : ICreditService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<CreditService> _logger;
        private readonly IHubContext<SoundHub> _soundHub;
        private CreditSettings _cachedSettings;
        private readonly object _settingsLock = new object();
        private Timer _hourlyTimer;

        public CreditService(
            IServiceProvider serviceProvider,
            ILogger<CreditService> logger,
            IHubContext<SoundHub> soundHub)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
            _soundHub = soundHub;
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
            var settings = GetSettings();
            if (!settings.HourlyCreditsEnabled)
            {
                return;
            }

            try
            {
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
    }
}
