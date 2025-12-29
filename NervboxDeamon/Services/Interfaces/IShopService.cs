namespace NervboxDeamon.Services.Interfaces
{
    public interface IShopService
    {
        /// <summary>
        /// Get current wood balance for a user
        /// </summary>
        int GetUserWood(int userId);

        /// <summary>
        /// Purchase wood for Shekel (25000 N$ per wood)
        /// </summary>
        /// <returns>Tuple with success status, new wood balance, new credit balance, and message</returns>
        (bool success, int newWoodBalance, int newCreditBalance, string message) PurchaseWood(int userId, int quantity);

        /// <summary>
        /// Get inventory info for a user (wood count)
        /// </summary>
        InventoryInfo GetInventory(int userId);
    }

    public class InventoryInfo
    {
        public int Wood { get; set; }
        public int WoodPrice { get; set; } = 25000;  // Price per wood in Shekel
    }
}
