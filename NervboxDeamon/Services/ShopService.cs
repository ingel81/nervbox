using System;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using NervboxDeamon.DbModels;
using NervboxDeamon.Services.Interfaces;

namespace NervboxDeamon.Services
{
    public class ShopService : IShopService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ICreditService _creditService;
        private readonly ILogger<ShopService> _logger;

        // Price constants
        public const int WOOD_PRICE = 25000;  // 25.000 Shekel per wood

        public ShopService(
            IServiceProvider serviceProvider,
            ICreditService creditService,
            ILogger<ShopService> logger)
        {
            _serviceProvider = serviceProvider;
            _creditService = creditService;
            _logger = logger;
        }

        public int GetUserWood(int userId)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();
            var user = db.Users.Find(userId);
            return user?.Wood ?? 0;
        }

        public InventoryInfo GetInventory(int userId)
        {
            return new InventoryInfo
            {
                Wood = GetUserWood(userId),
                WoodPrice = WOOD_PRICE
            };
        }

        public (bool success, int newWoodBalance, int newCreditBalance, string message) PurchaseWood(int userId, int quantity)
        {
            if (quantity <= 0)
            {
                return (false, GetUserWood(userId), _creditService.GetUserCredits(userId), "Ungültige Menge!");
            }

            if (quantity > 100)
            {
                return (false, GetUserWood(userId), _creditService.GetUserCredits(userId), "Maximal 100 Holz pro Kauf!");
            }

            int totalCost = quantity * WOOD_PRICE;

            // Check if user has enough credits
            if (!_creditService.HasEnoughCredits(userId, totalCost))
            {
                int currentCredits = _creditService.GetUserCredits(userId);
                return (false, GetUserWood(userId), currentCredits,
                    $"Nicht genug Shekel! Du brauchst {totalCost:N0} N$, hast aber nur {currentCredits:N0} N$.");
            }

            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();

            var user = db.Users.Find(userId);
            if (user == null)
            {
                _logger.LogWarning($"User {userId} not found for wood purchase");
                return (false, 0, 0, "Benutzer nicht gefunden!");
            }

            // Deduct credits
            string description = quantity == 1
                ? $"Heiliges Holz gekauft"
                : $"{quantity}x Heiliges Holz gekauft";

            bool deducted = _creditService.DeductCredits(userId, totalCost, CreditTransactionType.ShopPurchase, description);

            if (!deducted)
            {
                return (false, user.Wood, _creditService.GetUserCredits(userId), "Transaktion fehlgeschlagen!");
            }

            // Add wood to user
            user.Wood += quantity;
            db.SaveChanges();

            int newCreditBalance = _creditService.GetUserCredits(userId);

            _logger.LogInformation($"User {userId} purchased {quantity} wood for {totalCost} credits. New wood balance: {user.Wood}");

            string successMessage = quantity == 1
                ? $"Heiliges Holz gekauft! Du hast jetzt {user.Wood} Holz."
                : $"{quantity}x Heiliges Holz gekauft! Du hast jetzt {user.Wood} Holz.";

            return (true, user.Wood, newCreditBalance, successMessage);
        }
    }
}
