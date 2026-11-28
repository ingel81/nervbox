using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using NervboxDeamon.Controllers.Base;
using NervboxDeamon.DbModels;
using NervboxDeamon.Services.Interfaces;

namespace NervboxDeamon.Controllers
{
    /// <summary>
    /// Rubbellose der Nervbox-Zentralbank ("Vertrauen seit 1996").
    ///
    /// Der Server entscheidet alles: beim Kauf wird der Preis abgebucht, das komplette Los
    /// (Symbolraster + Auszahlung) erzeugt und ein Gewinn sofort gutgeschrieben. Der Client
    /// rubbelt nur noch frei, was ohnehin schon feststeht (Weggehen kostet also nichts).
    ///
    /// Regeln (fuer alle Lose gleich, 3x3 Felder):
    ///  - 3 gleiche Symbole = Gewinn laut Gewinnplan (pro Los genau ein Gewinn)
    ///  - "wild" (Nervbox-Logo) ersetzt ein beliebiges Symbol
    ///  - "admin" auf dem Los = Los beschlagnahmt, alles weg (auch wenn 3 gleiche dabei sind)
    ///  - Mett-Igel-Jackpot hat zusaetzlich ein Bonusfeld mit Multiplikator x1/x2/x5
    ///
    /// Erzeugung: erst wird das Ergebnis gewuerfelt (Gewinnstufe oder Niete), dann ein Raster
    /// gebaut, das genau dieses Ergebnis ergibt, und zur Sicherheit mit Evaluate() geprueft.
    /// RTP je Los ~86-89 % (siehe Tickets / GET tickets -> rtp).
    /// </summary>
    [Route("api/casino/scratch")]
    [ApiController]
    public class CasinoScratchController : NervboxBaseController<CasinoScratchController>
    {
        public const string Wild = "wild";
        public const string Admin = "admin";
        private const int Cells = 9;

        private readonly ICreditService _creditService;

        public CasinoScratchController(ICreditService creditService)
        {
            _creditService = creditService;
        }

        // ------------------------------------------------------------------ Lose

        public sealed record ScratchSymbol(string Id, string Name, int Prize, double Prob);

        public sealed record BonusOption(int Multiplier, double Prob);

        public sealed record TicketDef(
            string Key,
            string Name,
            int Price,
            ScratchSymbol[] Symbols,
            double AdminConfiscateProb,
            double AdminLossProb,
            double WildShare,
            BonusOption[] Bonus);

        /// <summary>Gewinnplaene. Prob = Wahrscheinlichkeit pro Los fuer genau diesen Gewinn.</summary>
        public static readonly TicketDef[] Tickets =
        {
            new("holz", "Holzfäller-Glück", 5, new[]
            {
                new ScratchSymbol("tanne", "Tanne", 5, 0.110),
                new ScratchSymbol("axt", "Axt", 10, 0.085),
                new ScratchSymbol("saege", "Säge", 15, 0.050),
                new ScratchSymbol("scheit", "Holzscheit", 25, 0.035),
                new ScratchSymbol("hirsch", "Hirsch", 50, 0.012),
                new ScratchSymbol("eule", "Eule", 100, 0.004),
                new ScratchSymbol("goldscheit", "Goldenes Scheit", 500, 0.0008),
            }, 0.03, 0.10, 0.30, null),
            new("tresor", "Zentralbank-Tresor", 20, new[]
            {
                new ScratchSymbol("muenze", "Münze", 20, 0.100),
                new ScratchSymbol("schwein", "Sparschwein", 40, 0.080),
                new ScratchSymbol("schluessel", "Tresorschlüssel", 60, 0.050),
                new ScratchSymbol("schein", "Schuldschein", 100, 0.030),
                new ScratchSymbol("barren", "Goldbarren", 200, 0.015),
                new ScratchSymbol("diamant", "Diamant", 400, 0.005),
                new ScratchSymbol("tresor", "Tresor", 2000, 0.0008),
            }, 0.03, 0.10, 0.30, null),
            new("mett", "Mett-Igel-Jackpot", 50, new[]
            {
                new ScratchSymbol("zwiebel", "Zwiebel", 50, 0.110),
                new ScratchSymbol("broetchen", "Brötchen", 100, 0.070),
                new ScratchSymbol("pfeffer", "Pfeffer", 150, 0.040),
                new ScratchSymbol("gurke", "Gewürzgurke", 250, 0.020),
                new ScratchSymbol("bier", "Feierabendbier", 500, 0.009),
                new ScratchSymbol("igel", "Mett-Igel", 1000, 0.004),
                new ScratchSymbol("goldigel", "Goldener Mett-Igel", 5000, 0.0006),
            }, 0.03, 0.10, 0.30, new[]
            {
                new BonusOption(1, 0.85),
                new BonusOption(2, 0.12),
                new BonusOption(5, 0.03),
            }),
        };

        public static double Rtp(TicketDef t)
        {
            double mult = t.Bonus == null ? 1.0 : t.Bonus.Sum(b => b.Multiplier * b.Prob);
            return t.Symbols.Sum(s => s.Prob * s.Prize) * mult / t.Price;
        }

        // ------------------------------------------------------------------ API

        /// <summary>GET /api/casino/scratch/tickets - Lose, Preise, Gewinnplaene</summary>
        [HttpGet("tickets")]
        [Authorize]
        public IActionResult GetTickets()
        {
            return Ok(Tickets.Select(t => new
            {
                t.Key,
                t.Name,
                t.Price,
                Rtp = Math.Round(Rtp(t), 3),
                WinChance = Math.Round(t.Symbols.Sum(s => s.Prob), 3),
                Symbols = t.Symbols.Select(s => new { s.Id, s.Name, s.Prize }),
                Bonus = t.Bonus?.Select(b => b.Multiplier),
            }));
        }

        /// <summary>POST /api/casino/scratch/buy - Los kaufen, Server erzeugt + wertet aus</summary>
        [HttpPost("buy")]
        [Authorize]
        public IActionResult Buy([FromBody] ScratchBuyRequest request)
        {
            try
            {
                var def = Tickets.FirstOrDefault(t => t.Key == request?.TicketType);
                if (def == null)
                {
                    return BadRequest(new { Error = "Unbekanntes Los" });
                }

                var userId = UserId;
                var serial = $"NB-{def.Key.ToUpperInvariant()}-{RandomNumberGenerator.GetInt32(100000, 1000000)}";

                if (!_creditService.DeductCredits(userId, def.Price, CreditTransactionType.GambleLoss,
                        $"Rubbellos {def.Name} gekauft ({def.Price} N$)", $"scratch:{serial}"))
                {
                    return BadRequest(new { Error = "Nicht genug N$ für dieses Los" });
                }

                var ticket = Generate(def);
                var credited = 0;
                if (ticket.Payout > 0)
                {
                    var before = _creditService.GetUserCredits(userId);
                    var symName = def.Symbols.First(s => s.Id == ticket.WinSymbol).Name;
                    var bonusText = ticket.Bonus > 1 ? $" × Bonus {ticket.Bonus}" : "";
                    _creditService.AddCredits(userId, ticket.Payout, CreditTransactionType.GambleWin,
                        $"Rubbellos {def.Name}: 3× {symName}{bonusText} = {ticket.Payout} N$", $"scratch:{serial}");
                    credited = _creditService.GetUserCredits(userId) - before;
                }

                try
                {
                    var achievements = HttpContext.RequestServices.GetService<IAchievementService>();
                    achievements?.CheckGamblingAchievements(userId, ticket.Payout > def.Price,
                        ticket.Payout > 0 ? ticket.Payout : def.Price);
                }
                catch (Exception ex)
                {
                    Logger?.LogWarning($"Rubbellos achievements failed: {ex.Message}");
                }

                Logger?.LogInformation(
                    $"User {userId} Rubbellos {def.Key} {serial}: win={ticket.WinSymbol ?? "-"} payout={ticket.Payout} credited={credited} admin={ticket.Confiscated}");

                return Ok(new
                {
                    TicketType = def.Key,
                    Serial = serial,
                    Price = def.Price,
                    Grid = ticket.Grid,
                    WinSymbol = ticket.WinSymbol,
                    WinCells = ticket.WinCells,
                    Bonus = def.Bonus != null ? ticket.Bonus : (int?)null,
                    Payout = ticket.Payout,
                    Credited = credited,
                    Confiscated = ticket.Confiscated,
                    ConfiscatedSymbol = ticket.ConfiscatedSymbol,
                    NewBalance = _creditService.GetUserCredits(userId),
                });
            }
            catch (Exception ex)
            {
                Logger?.LogError(ex, "Rubbellos failed");
                return StatusCode(500, new { Error = ex.Message });
            }
        }

        // ------------------------------------------------------------------ Erzeugung

        public sealed class GeneratedTicket
        {
            public string[] Grid { get; set; }
            public string WinSymbol { get; set; }
            public int[] WinCells { get; set; } = Array.Empty<int>();
            public int Bonus { get; set; } = 1;
            public int Payout { get; set; }
            public bool Confiscated { get; set; }
            public string ConfiscatedSymbol { get; set; }
        }

        public sealed class Evaluation
        {
            public string WinSymbol;
            public int[] WinCells = Array.Empty<int>();
            public bool AdminPresent;
        }

        private static double Rand() => RandomNumberGenerator.GetInt32(0, 1 << 30) / (double)(1 << 30);

        private static int RandInt(int maxExclusive) => RandomNumberGenerator.GetInt32(0, maxExclusive);

        public static GeneratedTicket Generate(TicketDef def)
        {
            // 1) Ergebnis wuerfeln
            ScratchSymbol win = null;
            double r = Rand(), acc = 0;
            foreach (var s in def.Symbols)
            {
                acc += s.Prob;
                if (r < acc) { win = s; break; }
            }

            ScratchSymbol confiscate = null;
            bool adminDecoy = false;
            if (win == null)
            {
                double winChance = def.Symbols.Sum(s => s.Prob);
                double loss = 1 - winChance;
                double r2 = (r - winChance) / loss; // gleichverteilt in [0,1)
                if (r2 < def.AdminConfiscateProb / loss)
                {
                    // "Beinahe-Gewinn" - eher die dicken Symbole, damit es weh tut
                    var pool = def.Symbols.Skip(1).ToArray();
                    confiscate = pool[RandInt(pool.Length)];
                }
                else if (Rand() < def.AdminLossProb)
                {
                    adminDecoy = true;
                }
            }

            int bonus = 1;
            if (def.Bonus != null)
            {
                double rb = Rand(), ab = 0;
                foreach (var b in def.Bonus)
                {
                    ab += b.Prob;
                    if (rb < ab) { bonus = b.Multiplier; break; }
                }
            }

            // 2) Raster bauen, bis Evaluate() genau das gewuerfelte Ergebnis liefert
            var target = win ?? confiscate;
            for (int attempt = 0; attempt < 200; attempt++)
            {
                var grid = BuildGrid(def, target, confiscate != null || adminDecoy);
                var ev = Evaluate(def, grid);
                bool ok = target == null ? ev.WinSymbol == null : ev.WinSymbol == target.Id;
                ok &= ev.AdminPresent == (confiscate != null || adminDecoy);
                if (!ok) continue;

                return new GeneratedTicket
                {
                    Grid = grid,
                    WinSymbol = win?.Id,
                    WinCells = win != null || confiscate != null ? ev.WinCells : Array.Empty<int>(),
                    Bonus = bonus,
                    Payout = win != null ? win.Prize * bonus : 0,
                    Confiscated = confiscate != null,
                    ConfiscatedSymbol = confiscate?.Id,
                };
            }

            throw new InvalidOperationException("Rubbellos-Erzeugung fehlgeschlagen");
        }

        /// <summary>
        /// Baut ein 3x3-Raster. target != null: genau dieses Symbol als Dreier (evtl. mit Wild).
        /// target == null: Niete (jedes Symbol hoechstens 2x, kein Wild).
        /// withAdmin: ein Feld wird zum Admin.
        /// </summary>
        private static string[] BuildGrid(TicketDef def, ScratchSymbol target, bool withAdmin)
        {
            var cells = new List<string>();
            var counts = def.Symbols.ToDictionary(s => s.Id, _ => 0);
            int cap = 2;

            if (target != null)
            {
                bool useWild = Rand() < def.WildShare;
                cells.Add(target.Id);
                cells.Add(target.Id);
                cells.Add(useWild ? Wild : target.Id);
                counts[target.Id] = 99; // nicht weiter verwenden
                if (useWild) cap = 1; // sonst ergaebe jedes Paar + Wild einen zweiten Gewinn
            }
            else if (Rand() < 0.55)
            {
                // Niete mit Beinahe-Treffer: ein Paar eines der grossen Symbole
                var big = def.Symbols.Skip(3).ToArray();
                var pair = big[RandInt(big.Length)];
                cells.Add(pair.Id);
                cells.Add(pair.Id);
                counts[pair.Id] = 2;
            }

            if (withAdmin) cells.Add(Admin);

            while (cells.Count < Cells)
            {
                var avail = def.Symbols.Where(s => counts[s.Id] < cap).ToArray();
                if (avail.Length == 0) break;
                // Kleine Symbole etwas haeufiger auf dem Los, damit die grossen selten wirken
                double total = avail.Sum(s => Weight(def, s));
                double x = Rand() * total;
                var pick = avail[^1];
                foreach (var s in avail)
                {
                    x -= Weight(def, s);
                    if (x <= 0) { pick = s; break; }
                }
                cells.Add(pick.Id);
                counts[pick.Id]++;
            }

            // Fisher-Yates
            var arr = cells.ToArray();
            for (int i = arr.Length - 1; i > 0; i--)
            {
                int j = RandInt(i + 1);
                (arr[i], arr[j]) = (arr[j], arr[i]);
            }
            return arr;
        }

        private static double Weight(TicketDef def, ScratchSymbol s)
        {
            int idx = Array.IndexOf(def.Symbols, s);
            return 1.0 / (1 + idx * 0.25);
        }

        /// <summary>Wertet ein Raster nach den Losregeln aus (bestes Symbol mit Anzahl + Wilds >= 3).</summary>
        public static Evaluation Evaluate(TicketDef def, string[] grid)
        {
            var ev = new Evaluation { AdminPresent = grid.Contains(Admin) };
            int wilds = grid.Count(g => g == Wild);
            ScratchSymbol best = null;
            foreach (var s in def.Symbols)
            {
                int c = grid.Count(g => g == s.Id);
                if (c > 0 && c + wilds >= 3 && (best == null || s.Prize > best.Prize)) best = s;
            }
            if (best == null) return ev;

            ev.WinSymbol = best.Id;
            ev.WinCells = Enumerable.Range(0, grid.Length)
                .Where(i => grid[i] == best.Id || grid[i] == Wild)
                .ToArray();
            return ev;
        }
    }

    public class ScratchBuyRequest
    {
        public string TicketType { get; set; }
    }
}
