using System;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NervboxDeamon.Controllers.Base;
using NervboxDeamon.Services.Interfaces;

namespace NervboxDeamon.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class ShopController : NervboxBaseController<ShopController>
    {
        private readonly IShopService _shopService;

        public ShopController(IShopService shopService)
        {
            _shopService = shopService;
        }

        /// <summary>
        /// GET /api/shop/inventory - Get current user's inventory (wood, etc.)
        /// </summary>
        [HttpGet("inventory")]
        [Authorize]
        public IActionResult GetInventory()
        {
            try
            {
                var inventory = _shopService.GetInventory(UserId);
                return Ok(inventory);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { Error = ex.Message });
            }
        }

        /// <summary>
        /// POST /api/shop/purchase - Purchase an item from the shop
        /// </summary>
        [HttpPost("purchase")]
        [Authorize]
        public IActionResult Purchase([FromBody] PurchaseRequest request)
        {
            try
            {
                if (string.IsNullOrEmpty(request.ItemType))
                {
                    return BadRequest(new { Error = "Item type is required" });
                }

                if (request.Quantity <= 0)
                {
                    return BadRequest(new { Error = "Quantity must be at least 1" });
                }

                switch (request.ItemType.ToLower())
                {
                    case "wood":
                    case "holz":
                        var (success, newWoodBalance, newCreditBalance, message) = _shopService.PurchaseWood(UserId, request.Quantity);
                        return Ok(new
                        {
                            Success = success,
                            ItemType = "wood",
                            Quantity = request.Quantity,
                            NewWoodBalance = newWoodBalance,
                            NewCreditBalance = newCreditBalance,
                            Message = message
                        });

                    default:
                        return BadRequest(new { Error = $"Unbekanntes Item: {request.ItemType}" });
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { Error = ex.Message });
            }
        }
    }

    public class PurchaseRequest
    {
        public string ItemType { get; set; }
        public int Quantity { get; set; } = 1;
    }
}
