using System;
using System.Linq;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NervboxDeamon.Controllers.Base;
using NervboxDeamon.DbModels;
using NervboxDeamon.Services.Interfaces;

namespace NervboxDeamon.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class CreditController : NervboxBaseController<CreditController>
    {
        private readonly ICreditService _creditService;

        public CreditController(ICreditService creditService)
        {
            _creditService = creditService;
        }

        /// <summary>
        /// GET /api/credit - Get current user's credit balance
        /// </summary>
        [HttpGet]
        [Authorize]
        public IActionResult GetCredits()
        {
            try
            {
                var credits = _creditService.GetUserCredits(UserId);
                var settings = _creditService.GetSettings();

                // Also try to grant hourly credits if eligible
                _creditService.TryGrantHourlyCredits(UserId);
                var updatedCredits = _creditService.GetUserCredits(UserId);

                return Ok(new
                {
                    Credits = updatedCredits,
                    CostPerPlay = settings.CostPerSoundPlay,
                    MaxCredits = settings.MaxCreditsUser,
                    HourlyCreditsEnabled = settings.HourlyCreditsEnabled,
                    HourlyCreditsAmount = settings.HourlyCreditsAmount
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { Error = ex.Message });
            }
        }

        /// <summary>
        /// GET /api/credit/settings - Get credit settings (Admin only)
        /// </summary>
        [HttpGet("settings")]
        [Authorize(Roles = "admin")]
        public IActionResult GetSettings()
        {
            try
            {
                var settings = _creditService.GetSettings();
                return Ok(settings);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { Error = ex.Message });
            }
        }

        /// <summary>
        /// PUT /api/credit/settings - Update credit settings (Admin only)
        /// </summary>
        [HttpPut("settings")]
        [Authorize(Roles = "admin")]
        public IActionResult UpdateSettings([FromBody] CreditSettings settings)
        {
            try
            {
                if (settings.CostPerSoundPlay < 0)
                {
                    return BadRequest(new { Error = "Cost per sound play cannot be negative" });
                }

                if (settings.InitialCreditsUser < 0)
                {
                    return BadRequest(new { Error = "Initial credits cannot be negative" });
                }

                if (settings.MaxCreditsUser < 1)
                {
                    return BadRequest(new { Error = "Max credits must be at least 1" });
                }

                var updatedSettings = _creditService.UpdateSettings(settings);
                return Ok(updatedSettings);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { Error = ex.Message });
            }
        }

        /// <summary>
        /// GET /api/credit/transactions - Get transaction history for current user
        /// </summary>
        [HttpGet("transactions")]
        [Authorize]
        public IActionResult GetTransactions([FromQuery] int limit = 50)
        {
            try
            {
                var transactions = _creditService.GetTransactionHistory(UserId, limit);
                return Ok(transactions.Select(t => new
                {
                    t.Id,
                    t.Amount,
                    Type = t.TransactionType.ToString(),
                    t.Description,
                    t.BalanceAfter,
                    t.CreatedAt
                }));
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { Error = ex.Message });
            }
        }

        /// <summary>
        /// POST /api/credit/grant - Grant credits to a user (Admin only)
        /// </summary>
        [HttpPost("grant")]
        [Authorize(Roles = "admin")]
        public IActionResult GrantCredits([FromBody] CreditGrantRequest request)
        {
            try
            {
                if (request.UserId <= 0)
                {
                    return BadRequest(new { Error = "Invalid user ID" });
                }

                if (request.Amount <= 0)
                {
                    return BadRequest(new { Error = "Amount must be positive" });
                }

                var user = DbContext.Users.Find(request.UserId);
                if (user == null)
                {
                    return NotFound(new { Error = "User not found" });
                }

                _creditService.AdminGrantCredits(request.UserId, request.Amount, request.Reason);

                var newBalance = _creditService.GetUserCredits(request.UserId);
                return Ok(new
                {
                    UserId = request.UserId,
                    Username = user.Username,
                    AmountGranted = request.Amount,
                    NewBalance = newBalance
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { Error = ex.Message });
            }
        }

        /// <summary>
        /// GET /api/credit/user/{userId} - Get a user's credits (Admin only)
        /// </summary>
        [HttpGet("user/{userId}")]
        [Authorize(Roles = "admin")]
        public IActionResult GetUserCredits(int userId)
        {
            try
            {
                var user = DbContext.Users.Find(userId);
                if (user == null)
                {
                    return NotFound(new { Error = "User not found" });
                }

                return Ok(new
                {
                    UserId = user.Id,
                    Username = user.Username,
                    Credits = user.Credits,
                    Role = user.Role
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { Error = ex.Message });
            }
        }

        /// <summary>
        /// GET /api/credit/leaderboard - Get top users by credits
        /// </summary>
        [HttpGet("leaderboard")]
        public IActionResult GetLeaderboard([FromQuery] int limit = 10)
        {
            try
            {
                var topUsers = DbContext.Users
                    .Where(u => u.IsActive && u.Role != "admin")
                    .OrderByDescending(u => u.Credits)
                    .Take(limit)
                    .Select(u => new
                    {
                        u.Id,
                        u.Username,
                        u.Credits
                    })
                    .ToList();

                return Ok(topUsers);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { Error = ex.Message });
            }
        }
    }

    public class CreditGrantRequest
    {
        public int UserId { get; set; }
        public int Amount { get; set; }
        public string Reason { get; set; }
    }
}
