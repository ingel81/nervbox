using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using NervboxDeamon.Controllers.Base;
using NervboxDeamon.DbModels;
using NervboxDeamon.Services.Interfaces;

namespace NervboxDeamon.Controllers
{
    /// <summary>
    /// Europaeisches Roulette (einfache Null). Der Server prueft die Einsaetze, bucht sie ab,
    /// zieht die Zahl mit einem kryptografischen Zufallsgenerator und schreibt den Gewinn gut.
    /// Der Client animiert nur das Ergebnis.
    /// </summary>
    [Route("api/casino/roulette")]
    [ApiController]
    public class CasinoRouletteController : NervboxBaseController<CasinoRouletteController>
    {
        /// <summary>Maximaler Gesamteinsatz pro Dreh (muss zum Frontend passen: roulette.types.ts MAX_TOTAL_BET)</summary>
        public const int MaxTotalBet = 500;
        /// <summary>Maximale Anzahl Einzelwetten pro Dreh</summary>
        public const int MaxBetCount = 60;

        private static readonly HashSet<int> RedNumbers = new HashSet<int>
        {
            1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36
        };

        /// <summary>Serialisiert Abbuchen + Ziehen + Gutschrift, damit parallele Drehs nicht doppelt ausgeben.</summary>
        private static readonly object SpinLock = new object();

        private readonly ICreditService _creditService;
        private readonly IAchievementService _achievementService;

        public CasinoRouletteController(ICreditService creditService, IAchievementService achievementService)
        {
            _creditService = creditService;
            _achievementService = achievementService;
        }

        /// <summary>
        /// POST /api/casino/roulette/spin
        /// Body: { bets: [{ type, value, amount }] }
        /// type: straight (value 0-36) | red | black | odd | even | low | high | dozen (value 1-3) | column (value 1-3)
        /// </summary>
        [HttpPost("spin")]
        [Authorize]
        public IActionResult Spin([FromBody] RouletteSpinRequest request)
        {
            try
            {
                if (request?.Bets == null || request.Bets.Count == 0)
                {
                    return BadRequest(new { Error = "Keine Einsätze gesetzt" });
                }

                if (request.Bets.Count > MaxBetCount)
                {
                    return BadRequest(new { Error = $"Zu viele Einzelwetten (max. {MaxBetCount})" });
                }

                // Normalisieren + pruefen, gleiche Felder zusammenfassen
                var merged = new Dictionary<string, RouletteBet>();
                foreach (var bet in request.Bets)
                {
                    var type = (bet?.Type ?? "").Trim().ToLowerInvariant();
                    if (bet == null || bet.Amount <= 0)
                    {
                        return BadRequest(new { Error = "Einsatz muss größer als 0 sein" });
                    }

                    if (bet.Amount > MaxTotalBet)
                    {
                        return BadRequest(new { Error = $"Maximaler Gesamteinsatz ist {MaxTotalBet} N$" });
                    }

                    if (!IsValidBet(type, bet.Value))
                    {
                        return BadRequest(new { Error = $"Ungültige Wette: {bet.Type} {bet.Value}" });
                    }

                    var value = NeedsValue(type) ? bet.Value : 0;
                    var key = $"{type}:{value}";
                    if (merged.TryGetValue(key, out var existing))
                    {
                        existing.Amount += bet.Amount;
                    }
                    else
                    {
                        merged[key] = new RouletteBet { Type = type, Value = value, Amount = bet.Amount };
                    }

                    if (merged[key].Amount > MaxTotalBet)
                    {
                        return BadRequest(new { Error = $"Maximaler Gesamteinsatz ist {MaxTotalBet} N$" });
                    }
                }

                var bets = merged.Values.ToList();
                long totalLong = bets.Sum(b => (long)b.Amount);
                if (totalLong > MaxTotalBet)
                {
                    return BadRequest(new { Error = $"Maximaler Gesamteinsatz ist {MaxTotalBet} N$" });
                }
                var totalBet = (int)totalLong;

                int number;
                int payout;
                int newBalance;
                var winningBets = new List<int>();

                lock (SpinLock)
                {
                    if (!_creditService.HasEnoughCredits(UserId, totalBet))
                    {
                        return BadRequest(new { Error = "Nicht genug N$ für diesen Einsatz", NewBalance = _creditService.GetUserCredits(UserId) });
                    }

                    var betSummary = string.Join(", ", bets.Select(b => NeedsValue(b.Type) ? $"{b.Type} {b.Value}: {b.Amount}" : $"{b.Type}: {b.Amount}"));
                    if (betSummary.Length > 180) betSummary = betSummary.Substring(0, 177) + "...";

                    if (!_creditService.DeductCredits(UserId, totalBet, CreditTransactionType.GambleLoss,
                            $"Roulette: Einsatz {totalBet} N$ ({betSummary})", "roulette:bet"))
                    {
                        return BadRequest(new { Error = "Nicht genug N$ für diesen Einsatz", NewBalance = _creditService.GetUserCredits(UserId) });
                    }

                    // Ziehung serverseitig, kryptografisch
                    number = RandomNumberGenerator.GetInt32(0, 37);

                    payout = 0;
                    for (int i = 0; i < bets.Count; i++)
                    {
                        var factor = PayoutFactor(bets[i].Type, bets[i].Value, number);
                        if (factor > 0)
                        {
                            payout += bets[i].Amount * factor;
                            winningBets.Add(i);
                        }
                    }

                    if (payout > 0)
                    {
                        _creditService.AddCredits(UserId, payout, CreditTransactionType.GambleWin,
                            $"Roulette: {number} {ColorOf(number)} – Auszahlung {payout} N$ (Einsatz {totalBet} N$)",
                            $"roulette:{number}");
                    }

                    newBalance = _creditService.GetUserCredits(UserId);
                }

                try
                {
                    _achievementService.CheckGamblingAchievements(UserId, payout > totalBet, payout);
                    _achievementService.CheckWealthAchievements(UserId, newBalance);
                }
                catch (Exception ex)
                {
                    Logger?.LogWarning($"Roulette achievements failed: {ex.Message}");
                }

                return Ok(new
                {
                    Number = number,
                    Color = ColorOf(number),
                    TotalBet = totalBet,
                    Payout = payout,
                    Net = payout - totalBet,
                    NewBalance = newBalance,
                    Bets = bets.Select((b, i) => new
                    {
                        b.Type,
                        b.Value,
                        b.Amount,
                        Won = winningBets.Contains(i),
                        Payout = winningBets.Contains(i) ? b.Amount * PayoutFactor(b.Type, b.Value, number) : 0
                    })
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { Error = ex.Message });
            }
        }

        private static bool NeedsValue(string type) =>
            type == "straight" || type == "dozen" || type == "column";

        private static bool IsValidBet(string type, int value)
        {
            switch (type)
            {
                case "straight":
                    return value >= 0 && value <= 36;
                case "dozen":
                case "column":
                    return value >= 1 && value <= 3;
                case "red":
                case "black":
                case "odd":
                case "even":
                case "low":
                case "high":
                    return true;
                default:
                    return false;
            }
        }

        public static string ColorOf(int number) =>
            number == 0 ? "green" : RedNumbers.Contains(number) ? "red" : "black";

        /// <summary>
        /// Rueckzahlungsfaktor inkl. Einsatz (0 = verloren). Standardquoten:
        /// Plein 35:1 (x36), Dutzend/Kolonne 2:1 (x3), einfache Chancen 1:1 (x2). Null: einfache Chancen verlieren.
        /// </summary>
        public static int PayoutFactor(string type, int value, int number)
        {
            switch (type)
            {
                case "straight":
                    return value == number ? 36 : 0;
                case "dozen":
                    return number >= 1 && (number - 1) / 12 + 1 == value ? 3 : 0;
                case "column":
                    return number >= 1 && (number - 1) % 3 + 1 == value ? 3 : 0;
            }

            if (number == 0) return 0;

            switch (type)
            {
                case "red":
                    return RedNumbers.Contains(number) ? 2 : 0;
                case "black":
                    return !RedNumbers.Contains(number) ? 2 : 0;
                case "odd":
                    return number % 2 == 1 ? 2 : 0;
                case "even":
                    return number % 2 == 0 ? 2 : 0;
                case "low":
                    return number <= 18 ? 2 : 0;
                case "high":
                    return number >= 19 ? 2 : 0;
                default:
                    return 0;
            }
        }
    }

    public class RouletteSpinRequest
    {
        public List<RouletteBet> Bets { get; set; }
    }

    public class RouletteBet
    {
        public string Type { get; set; }
        public int Value { get; set; }
        public int Amount { get; set; }
    }
}
