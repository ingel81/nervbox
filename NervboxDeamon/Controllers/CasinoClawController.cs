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
    /// Hotdog-Greifer (Casino-Minispiel, Schluessel "claw").
    ///
    /// Ablauf (Server entscheidet ueber Geld):
    ///   GET  /api/casino/claw/state   -> Topfinhalt + Einsaetze + Auszahlungstabelle
    ///   POST /api/casino/claw/start   -> zieht Einsatz ab, fuellt den Topf auf, wuerfelt die Greifkraft
    ///                                    (grip) und einen Seed; Antwort enthaelt tryId
    ///   POST /api/casino/claw/finish  -> {tryId, sausageId, type}: Server prueft tryId (eigener Nutzer,
    ///                                    einmalig, nicht abgelaufen, Mindestdauer), dass die Wurst im Topf
    ///                                    liegt, der Typ stimmt und ihr Gewicht &lt;= grip ist. Nur dann
    ///                                    wird die Auszahlung aus der Servertabelle gutgeschrieben.
    ///
    /// Hausvorteil: Die Greifkraft entscheidet, welche Wurstsorten ueberhaupt halten koennen. Selbst ein
    /// manipulierter Client, der bei jedem Versuch die beste erlaubte Wurst meldet, kommt auf hoechstens
    /// ~88 % Auszahlungsquote (siehe GripTiers). Ehrliche Spieler liegen darunter (Zielen, Rutschen).
    ///
    /// Topf und Versuche liegen nur im Speicher (Neustart = frischer Topf, offene Versuche verfallen).
    /// </summary>
    [Route("api/casino/claw")]
    [ApiController]
    public class CasinoClawController : NervboxBaseController<CasinoClawController>
    {
        // ---- Spielregeln ---------------------------------------------------------------------

        private static readonly int[] Stakes = { 5, 10, 20 };
        private const int PotSize = 8;
        private const int TimeLimitSeconds = 30;
        private static readonly TimeSpan TryLifetime = TimeSpan.FromMinutes(10);
        private static readonly TimeSpan MinTryDuration = TimeSpan.FromSeconds(3);

        private sealed record SausageDef(string Type, string Name, double Weight, double Multiplier, int SpawnWeight);

        /// <summary>Gewicht = noetige Greifkraft. Multiplikator bezieht sich auf den Einsatz.</summary>
        private static readonly SausageDef[] Sausages =
        {
            new("gurke", "Saure Gurke", 0.15, 0.3, 12),
            new("wiener", "Wiener", 0.30, 1.5, 42),
            new("bratwurst", "Bratwurst", 0.50, 2.0, 28),
            new("kaese", "Käsekrainer", 0.70, 3.0, 15),
            new("gold", "Goldwurst", 0.90, 10.0, 3),
        };

        /// <summary>
        /// Greifkraft-Stufen (Wahrscheinlichkeit in Promille, Bereich der Greifkraft).
        /// Worst case (Cheater, jede Sorte liegt immer im Topf):
        ///   0.15*0.3 + 0.20*1.5 + 0.11*2 + 0.055*3 + 0.015*10 = 0.88
        /// </summary>
        private static readonly (int Permille, double Min, double Max)[] GripTiers =
        {
            (470, 0.02, 0.12), // haelt nichts
            (150, 0.17, 0.27), // nur Gurke
            (200, 0.32, 0.47), // bis Wiener
            (110, 0.52, 0.67), // bis Bratwurst
            (55, 0.72, 0.87),  // bis Kaesekrainer
            (15, 0.92, 0.99),  // alles, auch Gold
        };

        // ---- Speicher -------------------------------------------------------------------------

        private sealed class PotItem
        {
            public int Id { get; init; }
            public string Type { get; init; }
        }

        private sealed class Pot
        {
            public List<PotItem> Items { get; } = new();
            public int NextId { get; set; } = 1;
        }

        private sealed class ClawTry
        {
            public string Id { get; init; }
            public int UserId { get; init; }
            public int Stake { get; init; }
            public double Grip { get; init; }
            public DateTime CreatedAt { get; init; }
            public bool Used { get; set; }
        }

        private static readonly object Sync = new();
        private static readonly Dictionary<int, Pot> Pots = new();
        private static readonly Dictionary<string, ClawTry> Tries = new();

        private readonly ICreditService _creditService;
        private readonly IAchievementService _achievementService;

        public CasinoClawController(ICreditService creditService, IAchievementService achievementService)
        {
            _creditService = creditService;
            _achievementService = achievementService;
        }

        // ---- Endpunkte ------------------------------------------------------------------------

        /// <summary>GET /api/casino/claw/state - aktueller Topf des Nutzers + Regeln</summary>
        [HttpGet("state")]
        [Authorize]
        public IActionResult GetState()
        {
            List<object> pot;
            lock (Sync)
            {
                pot = PotDto(GetPot(UserId));
            }

            return Ok(new
            {
                Pot = pot,
                Stakes,
                TimeLimit = TimeLimitSeconds,
                Payouts = Sausages.Select(s => new { s.Type, s.Name, s.Multiplier }),
            });
        }

        /// <summary>POST /api/casino/claw/start - Einsatz zahlen, Versuch beginnen</summary>
        [HttpPost("start")]
        [Authorize]
        public IActionResult Start([FromBody] ClawStartRequest request)
        {
            var userId = UserId;
            var stake = request?.Stake ?? 0;
            if (!Stakes.Contains(stake))
            {
                return BadRequest(new { Error = "Ungültiger Einsatz" });
            }

            // Doppelklick / zweiter Tab: solange ein frischer Versuch offen ist, kein zweiter Einsatz
            lock (Sync)
            {
                var running = Tries.Values.Any(t => t.UserId == userId && !t.Used
                    && DateTime.UtcNow - t.CreatedAt < TimeSpan.FromSeconds(TimeLimitSeconds + 20));
                if (running)
                {
                    return Conflict(new { Error = "Dein Greifer läuft noch" });
                }
            }

            if (!_creditService.DeductCredits(userId, stake, CreditTransactionType.GambleLoss,
                    $"Hotdog-Greifer: Einsatz {stake} N$", "claw:stake"))
            {
                return BadRequest(new { Error = "Nicht genug N$" });
            }

            ClawTry clawTry;
            List<object> pot;
            lock (Sync)
            {
                Cleanup();
                // Nur ein offener Versuch pro Nutzer: ein alter, nicht abgeschlossener verfaellt.
                foreach (var old in Tries.Values.Where(t => t.UserId == userId && !t.Used))
                {
                    old.Used = true;
                }

                var p = GetPot(userId);
                Refill(p);
                pot = PotDto(p);

                clawTry = new ClawTry
                {
                    Id = Guid.NewGuid().ToString("N"),
                    UserId = userId,
                    Stake = stake,
                    Grip = RollGrip(),
                    CreatedAt = DateTime.UtcNow,
                };
                Tries[clawTry.Id] = clawTry;
            }

            Logger?.LogInformation($"User {userId} Hotdog-Greifer start: {stake} N$, grip {clawTry.Grip:0.00}");

            return Ok(new
            {
                TryId = clawTry.Id,
                Seed = RandomNumberGenerator.GetInt32(1, int.MaxValue),
                Grip = Math.Round(clawTry.Grip, 3),
                Stake = stake,
                TimeLimit = TimeLimitSeconds,
                Pot = pot,
                NewBalance = _creditService.GetUserCredits(userId),
            });
        }

        /// <summary>POST /api/casino/claw/finish - Versuch abschliessen (mit oder ohne Wurst)</summary>
        [HttpPost("finish")]
        [Authorize]
        public IActionResult Finish([FromBody] ClawFinishRequest request)
        {
            var userId = UserId;
            if (request == null || string.IsNullOrEmpty(request.TryId))
            {
                return BadRequest(new { Error = "tryId fehlt" });
            }

            int payout = 0;
            string reason = null;
            SausageDef def = null;
            ClawTry clawTry;

            lock (Sync)
            {
                if (!Tries.TryGetValue(request.TryId, out clawTry) || clawTry.UserId != userId)
                {
                    return BadRequest(new { Error = "Unbekannter Versuch" });
                }

                if (clawTry.Used)
                {
                    return BadRequest(new { Error = "Versuch bereits abgeschlossen" });
                }

                clawTry.Used = true;
                var age = DateTime.UtcNow - clawTry.CreatedAt;

                if (request.SausageId.HasValue)
                {
                    var pot = GetPot(userId);
                    var item = pot.Items.FirstOrDefault(i => i.Id == request.SausageId.Value);
                    def = item == null ? null : Sausages.First(s => s.Type == item.Type);

                    if (age > TryLifetime) reason = "Versuch abgelaufen";
                    else if (age < MinTryDuration) reason = "Zu schnell";
                    else if (item == null) reason = "Wurst nicht im Topf";
                    else if (!string.Equals(item.Type, request.Type, StringComparison.OrdinalIgnoreCase)) reason = "Falsche Sorte";
                    else if (def.Weight > clawTry.Grip) reason = "Greifer zu schwach";
                    else
                    {
                        pot.Items.Remove(item);
                        payout = (int)Math.Floor(clawTry.Stake * def.Multiplier);
                    }
                }
            }

            if (payout > 0)
            {
                _creditService.AddCredits(userId, payout, CreditTransactionType.GambleWin,
                    $"Hotdog-Greifer: {def.Name} ({clawTry.Stake} N$ × {def.Multiplier:0.#}) = {payout} N$",
                    $"claw:{def.Type}");
            }

            if (reason != null)
            {
                Logger?.LogWarning($"User {userId} Hotdog-Greifer finish abgelehnt: {reason} (try {request.TryId}, sausage {request.SausageId}, type {request.Type})");
            }

            try
            {
                if (request.SausageId.HasValue || payout > 0)
                {
                    _achievementService.CheckGamblingAchievements(userId, payout > clawTry.Stake, payout);
                }
                _achievementService.CheckWealthAchievements(userId, _creditService.GetUserCredits(userId));
            }
            catch (Exception ex)
            {
                Logger?.LogWarning($"Hotdog-Greifer achievements failed: {ex.Message}");
            }

            List<object> potDto;
            lock (Sync)
            {
                potDto = PotDto(GetPot(userId));
            }

            return Ok(new
            {
                Accepted = payout > 0,
                Payout = payout,
                Type = payout > 0 ? def.Type : null,
                Name = payout > 0 ? def.Name : null,
                Reason = reason,
                Pot = potDto,
                NewBalance = _creditService.GetUserCredits(userId),
            });
        }

        // ---- Helfer ---------------------------------------------------------------------------

        private static Pot GetPot(int userId)
        {
            if (!Pots.TryGetValue(userId, out var pot))
            {
                pot = new Pot();
                Pots[userId] = pot;
                Refill(pot);
            }
            return pot;
        }

        private static void Refill(Pot pot)
        {
            while (pot.Items.Count < PotSize)
            {
                pot.Items.Add(new PotItem { Id = pot.NextId++, Type = RollType(pot) });
            }
        }

        private static string RollType(Pot pot)
        {
            var golds = pot.Items.Count(i => i.Type == "gold");
            var pickles = pot.Items.Count(i => i.Type == "gurke");
            var pool = Sausages
                .Where(s => !(s.Type == "gold" && golds >= 1) && !(s.Type == "gurke" && pickles >= 2))
                .ToArray();
            var total = pool.Sum(s => s.SpawnWeight);
            var roll = RandomNumberGenerator.GetInt32(total);
            foreach (var s in pool)
            {
                if (roll < s.SpawnWeight) return s.Type;
                roll -= s.SpawnWeight;
            }
            return "wiener";
        }

        private static double RollGrip()
        {
            var roll = RandomNumberGenerator.GetInt32(1000);
            foreach (var (permille, min, max) in GripTiers)
            {
                if (roll < permille)
                {
                    return min + RandomNumberGenerator.GetInt32(10001) / 10000.0 * (max - min);
                }
                roll -= permille;
            }
            return GripTiers[0].Min;
        }

        private static List<object> PotDto(Pot pot) =>
            pot.Items.Select(i => (object)new { i.Id, i.Type }).ToList();

        private static void Cleanup()
        {
            var cutoff = DateTime.UtcNow - TryLifetime - TimeSpan.FromMinutes(5);
            foreach (var key in Tries.Where(kv => kv.Value.CreatedAt < cutoff).Select(kv => kv.Key).ToList())
            {
                Tries.Remove(key);
            }
        }
    }

    public class ClawStartRequest
    {
        public int Stake { get; set; }
    }

    public class ClawFinishRequest
    {
        public string TryId { get; set; }
        public int? SausageId { get; set; }
        public string Type { get; set; }
    }
}
