using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using NervboxDeamon.DbModels;
using NervboxDeamon.Hubs;
using NervboxDeamon.Services.Interfaces;

namespace NervboxDeamon.Services
{
  /// <summary>
  /// LAN-Pong: server-authoritative real-time paddle game between two logged-in users (or vs. CPU).
  /// The whole simulation runs here at 60 Hz, state is broadcast at 30 Hz to the SignalR group of a match.
  /// Clients only send their paddle position (see PongHub.Input) and render with interpolation.
  ///
  /// Field (landscape, units): W x H = 800 x 500, goals at x=0 (slot 0, left) and x=W (slot 1, right).
  /// Stakes: both players pay on match start (GambleLoss), the winner gets the pot (GambleWin),
  /// a disconnect timeout forfeits the pot to the player who stayed; only aborts without a winner (both gone, server restart) refund. Explicit "Aufgeben" forfeits the pot.
  /// All state is guarded by a single lock; SignalR sends are collected and flushed outside the lock.
  /// </summary>
  public class PongService : BackgroundService
  {
    public const float W = 800f, H = 500f;
    public const float PadX = 30f, PadW = 12f, PadH = 92f, BallR = 8f;
    public const int WinScore = 7;
    public const int MaxStake = 500;
    private const float StartSpeed = 380f, SpeedUp = 1.055f, MaxSpeed = 1180f;
    private const float PaddleMaxSpeed = 3200f;
    private const float HitLeniency = 6f; // extra reach: paddle position on the server lags a few ms behind the client
    private const double InputStall = 1.5;
    private const double PauseBudget = 15.0;
    /// <summary>Users whose stakes are being paid right now (match not created yet) - blocks a second match in that window</summary>
    private readonly HashSet<int> _starting = new();
    private bool Busy(int userId) => ActiveMatchOf(userId) != null || _starting.Contains(userId);
    private const double DisconnectGrace = 5.0, InviteTtl = 45.0, OverTtl = 120.0;
    private const double TickRate = 60.0;
    private const int CpuUserId = 0;
    public const string CpuName = "NERVBOX";

    private readonly IHubContext<PongHub> _hub;
    private readonly ICreditService _credits;
    private readonly ILogger<PongService> _log;
    private readonly object _gate = new();
    private readonly Stopwatch _clock = Stopwatch.StartNew();
    private readonly Random _rng = new();
    private int _idSeq;
    private bool _lobbyDirty;

    private readonly Dictionary<string, Conn> _conns = new();
    private readonly Dictionary<string, Invite> _invites = new();
    private readonly Dictionary<string, Match> _matches = new();

    private sealed class Conn
    {
      public string Id;
      public int UserId;
      public string Name;
      public bool InLobby;
    }

    private sealed class Invite
    {
      public string Id;
      public int FromId;
      public string FromName;
      public string FromConn;
      public int? ToId; // null = open game, anyone may join
      public string ToName;
      public int Stake;
      public double ExpiresAt;
      public bool Starting;
    }

    private sealed class Player
    {
      public int UserId;
      public string Name;
      public string Conn;
      public bool Cpu;
      public float Y = H / 2, TargetY = H / 2, Vy;
      public int Score;
      public bool Connected = true;
      /// <summary>last paddle input (clients send at least every 250 ms) - detects dead Wi-Fi before the socket times out</summary>
      public double LastInputAt;
      public bool Present(double now) => Cpu || (Connected && now - LastInputAt < InputStall);
      public bool Left;
      public bool WantsRematch;
      public float CpuError;
    }

    private sealed class Match
    {
      public string Id;
      public Player[] P;
      public int Stake;
      public bool StakePaid;
      public bool Settled;
      public string Phase = "countdown"; // countdown | play | paused | over
      public double PhaseT;
      public string ResumePhase;
      /// <summary>Resume after a pause keeps the frozen ball (no reset) - otherwise pausing would dodge goals</summary>
      public bool ResumeKeepsBall;
      public float BvxHold, BvyHold, SpinHold;
      /// <summary>Accumulated pause time per slot; over the budget = forfeit</summary>
      public double[] PauseUsed = new double[2];
      public float Bx = W / 2, By = H / 2, Bvx, Bvy, Spin;
      public int ServeDir;
      public int Hits;
      public int Winner = -1;
      public string EndReason;
      public double OverAt;
      public bool RematchStarting;
      public string NextMatchId;
      public readonly HashSet<string> Spectators = new();
      public string Group => "pong-" + Id;
      public bool IsCpu => P[1].Cpu;
    }

    private sealed class Outbox
    {
      public readonly List<(IClientProxy target, string method, object arg)> Items = new();
      public void Add(IClientProxy t, string m, object a) => Items.Add((t, m, a));
    }

    public PongService(IHubContext<PongHub> hub, ICreditService credits, ILogger<PongService> log)
    {
      _hub = hub;
      _credits = credits;
      _log = log;
    }

    private double Now => _clock.Elapsed.TotalSeconds;
    private string NewId(string prefix) => prefix + Interlocked.Increment(ref _idSeq).ToString("x") + _rng.Next(0x1000, 0xffff).ToString("x");

    // ===================================================================== connection / lobby

    public void Connected(string connId, int userId, string name)
    {
      var box = new Outbox();
      lock (_gate)
      {
        _conns[connId] = new Conn { Id = connId, UserId = userId, Name = name };
        _lobbyDirty = true;
        // pending invites for this user (toast in a freshly opened tab)
        foreach (var inv in _invites.Values.Where(i => i.ToId == userId && !i.Starting))
          box.Add(_hub.Clients.Client(connId), "invite", InviteDto(inv));
      }
      Flush(box);
    }

    public void Disconnected(string connId)
    {
      var box = new Outbox();
      lock (_gate)
      {
        if (!_conns.Remove(connId, out var conn)) return;
        CancelInvitesFrom(conn, "cancelled", box);
        foreach (var m in _matches.Values)
        {
          m.Spectators.Remove(connId);
          for (var s = 0; s < 2; s++)
          {
            var p = m.P[s];
            if (p.Cpu || p.Conn != connId) continue;
            p.Connected = false;
            if (m.Phase == "over")
            {
              p.Left = true;
              p.WantsRematch = false;
              MarkStateDirty(m, box);
            }
          }
        }
        _lobbyDirty = true;
      }
      Flush(box);
    }

    /// <summary>Re-binds a reconnected client (new connection id) to its running match.</summary>
    public object Rejoin(string connId)
    {
      var box = new Outbox();
      object result = null;
      lock (_gate)
      {
        if (!_conns.TryGetValue(connId, out var conn)) return null;
        // running match first, otherwise a finished one this player has not left yet (shows the result)
        var m = ActiveMatchOf(conn.UserId)
          ?? _matches.Values.FirstOrDefault(x => x.Phase == "over" && x.P.Any(p => !p.Cpu && p.UserId == conn.UserId && !p.Left));
        if (m == null) return null;
        var slot = m.P[0].UserId == conn.UserId && !m.P[0].Cpu ? 0 : 1;
        var p = m.P[slot];
        p.Conn = connId;
        p.Connected = true;
        p.LastInputAt = Now;
        conn.InLobby = true;
        _ = _hub.Groups.AddToGroupAsync(connId, m.Group);
        result = MatchDto(m, slot);
        _lobbyDirty = true;
      }
      Flush(box);
      return result;
    }

    public void EnterLobby(string connId)
    {
      lock (_gate)
      {
        if (_conns.TryGetValue(connId, out var c)) c.InLobby = true;
        _lobbyDirty = true;
      }
    }

    public void LeaveLobby(string connId)
    {
      var box = new Outbox();
      lock (_gate)
      {
        if (!_conns.TryGetValue(connId, out var c)) return;
        c.InLobby = false;
        CancelInvitesFrom(c, "cancelled", box);
        foreach (var m in _matches.Values) m.Spectators.Remove(connId);
        _lobbyDirty = true;
      }
      Flush(box);
    }

    // ===================================================================== invites

    public string Challenge(string connId, int? targetUserId, int stake)
    {
      stake = Math.Clamp(stake, 0, MaxStake);
      var box = new Outbox();
      lock (_gate)
      {
        if (!_conns.TryGetValue(connId, out var c)) return "Nicht verbunden.";
        if (Busy(c.UserId)) return "Du spielst gerade schon.";
        if (targetUserId == c.UserId) return "Gegen dich selbst? Nimm die Nervbox.";
        string toName = null;
        if (targetUserId.HasValue)
        {
          var target = _conns.Values.FirstOrDefault(x => x.UserId == targetUserId.Value);
          if (target == null) return "Der Spieler ist nicht mehr online.";
          if (Busy(target.UserId)) return $"{target.Name} spielt gerade.";
          toName = target.Name;
        }
        if (stake > 0 && !_credits.HasEnoughCredits(c.UserId, stake)) return $"Zu wenig N$ für {stake} N$ Einsatz.";

        // one pending outgoing invite per user
        CancelInvitesFrom(c, "cancelled", box);
        var inv = new Invite
        {
          Id = NewId("i"),
          FromId = c.UserId,
          FromName = c.Name,
          FromConn = connId,
          ToId = targetUserId,
          ToName = toName,
          Stake = stake,
          ExpiresAt = Now + InviteTtl,
        };
        _invites[inv.Id] = inv;
        c.InLobby = true;
        if (inv.ToId.HasValue)
        {
          var targets = ConnIdsOf(inv.ToId.Value);
          if (targets.Count > 0) box.Add(_hub.Clients.Clients(targets), "invite", InviteDto(inv));
        }
        _lobbyDirty = true;
      }
      Flush(box);
      return null;
    }

    public string CancelInvite(string connId, string inviteId)
    {
      var box = new Outbox();
      lock (_gate)
      {
        if (!_invites.TryGetValue(inviteId, out var inv) || inv.Starting) return null;
        if (!_conns.TryGetValue(connId, out var c) || c.UserId != inv.FromId) return "Nicht deine Einladung.";
        CloseInvite(inv, "cancelled", $"{inv.FromName} hat die Herausforderung zurückgezogen.", box);
      }
      Flush(box);
      return null;
    }

    public string Decline(string connId, string inviteId)
    {
      var box = new Outbox();
      lock (_gate)
      {
        if (!_invites.TryGetValue(inviteId, out var inv) || inv.Starting) return null;
        if (!_conns.TryGetValue(connId, out var c) || inv.ToId != c.UserId) return null;
        CloseInvite(inv, "declined", $"{c.Name} hat abgelehnt.", box);
      }
      Flush(box);
      return null;
    }

    /// <summary>Accept a challenge (or join an open game). Deducts both stakes, then starts the match.</summary>
    public string Accept(string connId, string inviteId)
    {
      Invite inv;
      Conn me;
      lock (_gate)
      {
        if (!_invites.TryGetValue(inviteId, out inv)) return "Die Einladung ist nicht mehr gültig.";
        if (inv.Starting) return "Das Spiel startet schon.";
        if (!_conns.TryGetValue(connId, out me)) return "Nicht verbunden.";
        if (inv.FromId == me.UserId) return "Das ist deine eigene Einladung.";
        if (inv.ToId.HasValue && inv.ToId != me.UserId) return "Die Einladung gilt nicht dir.";
        if (Busy(me.UserId)) return "Du spielst gerade schon.";
        if (Busy(inv.FromId)) return $"{inv.FromName} spielt gerade.";
        if (!_conns.ContainsKey(inv.FromConn)) return $"{inv.FromName} ist nicht mehr da.";
        inv.Starting = true;
        _starting.Add(me.UserId);
        _starting.Add(inv.FromId);
      }

      // credits outside the lock (DB access) - the invite is reserved via Starting
      var players = new[] { (inv.FromId, inv.FromName), (me.UserId, me.Name) };
      var err = PayStakes(players, inv.Stake);

      var box = new Outbox();
      lock (_gate)
      {
        _starting.Remove(me.UserId);
        _starting.Remove(inv.FromId);
        _invites.Remove(inv.Id);
        _lobbyDirty = true;
        if (err != null)
        {
          var msg = new { id = inv.Id, reason = "failed", message = err };
          box.Add(_hub.Clients.Clients(ConnIdsOf(inv.FromId)), "inviteClosed", msg);
          box.Add(_hub.Clients.Clients(ConnIdsOf(me.UserId)), "inviteClosed", msg);
          Flush(box);
          return err;
        }
        if (!_conns.ContainsKey(inv.FromConn) || !_conns.ContainsKey(connId))
        {
          Refund(players, inv.Stake, "Gegner weg vor dem Anpfiff");
          box.Add(_hub.Clients.Clients(ConnIdsOf(me.UserId).Concat(ConnIdsOf(inv.FromId)).ToList()),
            "inviteClosed", new { id = inv.Id, reason = "failed", message = "Verbindung weg – Einsatz zurück." });
          Flush(box);
          return "Verbindung weg – Einsatz zurück.";
        }
        // other targets of this invite (second tab) see it as gone
        box.Add(_hub.Clients.Clients(ConnIdsOf(me.UserId).Where(x => x != connId).ToList()), "inviteClosed",
          new { id = inv.Id, reason = "accepted", message = (string)null });
        CancelInvitesFrom(me, "cancelled", box);
        var m = CreateMatch(
          new Player { UserId = inv.FromId, Name = inv.FromName, Conn = inv.FromConn },
          new Player { UserId = me.UserId, Name = me.Name, Conn = connId },
          inv.Stake);
        m.StakePaid = inv.Stake > 0;
        StartMatch(m, box);
      }
      Flush(box);
      return null;
    }

    public string PlayCpu(string connId)
    {
      var box = new Outbox();
      lock (_gate)
      {
        if (!_conns.TryGetValue(connId, out var c)) return "Nicht verbunden.";
        if (Busy(c.UserId)) return "Du spielst gerade schon.";
        CancelInvitesFrom(c, "cancelled", box);
        c.InLobby = true;
        var m = CreateMatch(
          new Player { UserId = c.UserId, Name = c.Name, Conn = connId },
          new Player { UserId = CpuUserId, Name = CpuName, Cpu = true, WantsRematch = true },
          0);
        StartMatch(m, box);
      }
      Flush(box);
      return null;
    }

    public object Spectate(string connId, string matchId)
    {
      lock (_gate)
      {
        if (!_conns.ContainsKey(connId) || !_matches.TryGetValue(matchId, out var m)) return null;
        m.Spectators.Add(connId);
        _ = _hub.Groups.AddToGroupAsync(connId, m.Group);
        return MatchDto(m, -1);
      }
    }

    // ===================================================================== in-match

    public void Input(string connId, string matchId, float y)
    {
      if (float.IsNaN(y) || float.IsInfinity(y)) return;
      lock (_gate)
      {
        if (!_matches.TryGetValue(matchId, out var m)) return;
        foreach (var p in m.P)
          if (!p.Cpu && p.Conn == connId)
          {
            p.TargetY = Math.Clamp(y, PadH / 2, H - PadH / 2);
            p.LastInputAt = Now;
          }
      }
    }

    /// <summary>Leave the match screen. Running match = forfeit (opponent gets the pot); spectators just leave.</summary>
    public void Leave(string connId, string matchId)
    {
      var box = new Outbox();
      lock (_gate)
      {
        if (!_matches.TryGetValue(matchId, out var m)) return;
        if (m.Spectators.Remove(connId))
        {
          _ = _hub.Groups.RemoveFromGroupAsync(connId, m.Group);
          return;
        }
        var slot = Array.FindIndex(m.P, p => !p.Cpu && p.Conn == connId);
        if (slot < 0) return;
        _ = _hub.Groups.RemoveFromGroupAsync(connId, m.Group);
        if (m.Phase != "over")
        {
          EndMatch(m, 1 - slot, "forfeit", box);
        }
        m.P[slot].Left = true;
        m.P[slot].WantsRematch = false;
        MarkStateDirty(m, box);
        _lobbyDirty = true;
      }
      Flush(box);
    }

    public string Rematch(string connId, string matchId)
    {
      Match m;
      lock (_gate)
      {
        if (!_matches.TryGetValue(matchId, out m) || m.Phase != "over") return "Das Spiel ist nicht vorbei.";
        if (m.NextMatchId != null) return null;
        var slot = Array.FindIndex(m.P, p => !p.Cpu && p.Conn == connId);
        if (slot < 0) return null;
        var other = m.P[1 - slot];
        if (other.Left || (!other.Cpu && !other.Connected)) return $"{other.Name} ist schon weg.";
        m.P[slot].WantsRematch = true;
        var box0 = new Outbox();
        MarkStateDirty(m, box0);
        Flush(box0);
        if (!m.P.All(p => p.WantsRematch) || m.RematchStarting) return null;
        if (m.P.Any(p => !p.Cpu && Busy(p.UserId))) return "Revanche geht nicht – einer spielt schon woanders.";
        m.RematchStarting = true;
        foreach (var p in m.P.Where(p => !p.Cpu)) _starting.Add(p.UserId);
      }

      // second player said yes: pay stakes again (outside lock)
      var players = m.P.Where(p => !p.Cpu).Select(p => (p.UserId, p.Name)).ToArray();
      var err = m.Stake > 0 ? PayStakes(players, m.Stake) : null;

      var box = new Outbox();
      lock (_gate)
      {
        m.RematchStarting = false;
        foreach (var p in m.P.Where(p => !p.Cpu)) _starting.Remove(p.UserId);
        if (err != null)
        {
          foreach (var p in m.P) p.WantsRematch = p.Cpu;
          MarkStateDirty(m, box);
          box.Add(_hub.Clients.Group(m.Group), "notice", new { message = "Revanche geplatzt: " + err });
          Flush(box);
          return err;
        }
        if (m.P.Any(p => !p.Cpu && (p.Left || !p.Connected)))
        {
          if (m.Stake > 0) Refund(players, m.Stake, "Revanche abgebrochen");
          Flush(box);
          return "Der Gegner ist weg – Einsatz zurück.";
        }
        // swap sides so the loser of the last match is on the other side - keeps it fresh
        var a = m.P[1];
        var b = m.P[0];
        var nm = CreateMatch(
          new Player { UserId = a.UserId, Name = a.Name, Conn = a.Conn, Cpu = a.Cpu, WantsRematch = a.Cpu },
          new Player { UserId = b.UserId, Name = b.Name, Conn = b.Conn, Cpu = b.Cpu, WantsRematch = b.Cpu },
          m.Stake);
        // keep CPU always on slot 1
        if (nm.P[0].Cpu) nm.P = new[] { nm.P[1], nm.P[0] };
        nm.StakePaid = m.Stake > 0;
        m.NextMatchId = nm.Id;
        foreach (var s in m.Spectators) nm.Spectators.Add(s);
        StartMatch(nm, box);
        foreach (var s in nm.Spectators)
        {
          _ = _hub.Groups.AddToGroupAsync(s, nm.Group);
          box.Add(_hub.Clients.Client(s), "match", MatchDto(nm, -1));
        }
        _matches.Remove(m.Id);
      }
      Flush(box);
      return null;
    }

    // ===================================================================== match lifecycle

    private Match CreateMatch(Player a, Player b, int stake)
    {
      var m = new Match { Id = NewId("m"), P = new[] { a, b }, Stake = stake };
      m.ServeDir = _rng.Next(2) == 0 ? -1 : 1;
      return m;
    }

    private void StartMatch(Match m, Outbox box)
    {
      _matches[m.Id] = m;
      foreach (var p in m.P) p.LastInputAt = Now + 2.0; // grace until the client view is up
      m.Phase = "countdown";
      m.PhaseT = 3.0;
      ResetBall(m);
      for (var s = 0; s < 2; s++)
      {
        var p = m.P[s];
        if (p.Cpu) continue;
        _ = _hub.Groups.AddToGroupAsync(p.Conn, m.Group);
        box.Add(_hub.Clients.Client(p.Conn), "match", MatchDto(m, s));
        if (_conns.TryGetValue(p.Conn, out var c)) c.InLobby = true;
      }
      _lobbyDirty = true;
      _log.LogInformation("Pong match {Id}: {A} vs {B}, stake {Stake}", m.Id, m.P[0].Name, m.P[1].Name, m.Stake);
    }

    private void EndMatch(Match m, int winner, string reason, Outbox box)
    {
      if (m.Phase == "over") return;
      m.Phase = "over";
      m.Winner = winner;
      m.EndReason = reason;
      m.OverAt = Now;
      m.Bvx = m.Bvy = m.Spin = 0;
      box.Add(_hub.Clients.Group(m.Group), "ev", new { id = m.Id, k = "over", side = winner, reason });
      MarkStateDirty(m, box);
      _lobbyDirty = true;

      if (m.Settled) return;
      m.Settled = true;
      if (!m.StakePaid || m.Stake <= 0) return;
      var humans = m.P.Where(p => !p.Cpu).Select(p => (p.UserId, p.Name)).ToArray();
      // A player who does not come back within the grace period forfeits (otherwise closing the
      // tab while losing would be a free refund). Only if nobody is left is the stake refunded.
      if (winner < 0)
      {
        // abort (both gone / no winner): nobody loses money
        Refund(humans, m.Stake, "Verbindungsabbruch"); // synchronous: must not get lost on shutdown
      }
      else
      {
        var w = m.P[winner];
        var l = m.P[1 - winner];
        var pot = m.Stake * 2;
        // synchronous (a few ms of DB): a fire-and-forget task could be lost on shutdown
        try
        {
          _credits.AddCredits(w.UserId, pot, CreditTransactionType.GambleWin, $"LAN-Pong: Sieg gegen {l.Name} ({pot} N$ Pot)", m.Id);
        }
        catch (Exception ex) { _log.LogError(ex, "Pong payout failed for match {Id}", m.Id); }
      }
    }

    /// <summary>Deducts the stake from all players; on any failure the already paid ones get refunded. Returns error text or null.</summary>
    private string PayStakes((int id, string name)[] players, int stake)
    {
      if (stake <= 0) return null;
      var paid = new List<(int id, string name)>();
      foreach (var p in players)
      {
        var opp = players.FirstOrDefault(x => x.id != p.id).name ?? "?";
        bool ok;
        try { ok = _credits.DeductCredits(p.id, stake, CreditTransactionType.GambleLoss, $"LAN-Pong: Einsatz gegen {opp}"); }
        catch (Exception ex) { _log.LogError(ex, "Pong stake deduction failed"); ok = false; }
        if (!ok)
        {
          Refund(paid.ToArray(), stake, "Spiel nicht zustande gekommen");
          return $"{p.name} hat keine {stake} N$.";
        }
        paid.Add(p);
      }
      return null;
    }

    private void Refund((int id, string name)[] players, int stake, string why)
    {
      foreach (var p in players)
      {
        try { _credits.AddCredits(p.id, stake, CreditTransactionType.GambleWin, $"LAN-Pong: Einsatz zurück ({why})"); }
        catch (Exception ex) { _log.LogError(ex, "Pong refund failed for user {Id}", p.id); }
      }
    }

    private void ResetBall(Match m)
    {
      m.Bx = W / 2;
      m.By = H / 2 + (float)(_rng.NextDouble() - 0.5) * 120f;
      m.Bvx = m.Bvy = m.Spin = 0;
      m.Hits = 0;
    }

    private void Serve(Match m)
    {
      var angle = (float)((_rng.NextDouble() - 0.5) * 0.8);
      m.Bvx = m.ServeDir * StartSpeed * MathF.Cos(angle);
      m.Bvy = StartSpeed * MathF.Sin(angle);
      m.Spin = 0;
    }

    // ===================================================================== game loop

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
      using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1.0 / TickRate));
      var last = Now;
      long tick = 0;
      while (!stoppingToken.IsCancellationRequested)
      {
        try
        {
          if (!await timer.WaitForNextTickAsync(stoppingToken)) break;
        }
        catch (OperationCanceledException) { break; }

        var now = Now;
        // fixed-ish step: catch up in 1/60 s slices (max 4) so physics stays deterministic-ish
        var elapsed = Math.Min(now - last, 4.0 / TickRate);
        last = now;
        tick++;
        var box = new Outbox();
        try
        {
          lock (_gate)
          {
            var steps = Math.Max(1, (int)Math.Round(elapsed * TickRate));
            var dt = (float)(elapsed / steps);
            foreach (var m in _matches.Values.ToList())
              for (var i = 0; i < steps; i++) Step(m, dt, box);

            if (tick % 2 == 0)
            {
              foreach (var m in _matches.Values)
                if (m.Phase != "over") box.Add(_hub.Clients.Group(m.Group), "state", StateDto(m));
            }
            Housekeeping(box);
            if (_lobbyDirty && tick % 6 == 0)
            {
              _lobbyDirty = false;
              BuildLobby(box);
            }
          }
        }
        catch (Exception ex)
        {
          _log.LogError(ex, "Pong loop error");
        }
        Flush(box);
      }
    }

    /// <summary>Server shutdown/restart: running matches are lost, so give paid stakes back.</summary>
    public override async Task StopAsync(CancellationToken cancellationToken)
    {
      List<((int id, string name)[] players, int stake)> refunds;
      lock (_gate)
      {
        refunds = _matches.Values
          .Where(m => m.Phase != "over" && m.StakePaid && !m.Settled && m.Stake > 0)
          .Select(m =>
          {
            m.Settled = true;
            return (m.P.Where(p => !p.Cpu).Select(p => (p.UserId, p.Name)).ToArray(), m.Stake);
          })
          .ToList();
      }
      foreach (var (players, stake) in refunds) Refund(players, stake, "Server-Neustart");
      await base.StopAsync(cancellationToken);
    }

    private void Housekeeping(Outbox box)
    {
      var now = Now;
      foreach (var inv in _invites.Values.Where(i => !i.Starting && i.ExpiresAt < now).ToList())
        CloseInvite(inv, "expired", "Die Herausforderung ist abgelaufen.", box);
      foreach (var m in _matches.Values.Where(m => m.Phase == "over").ToList())
      {
        var gone = m.P.All(p => p.Cpu || p.Left || !p.Connected);
        if (gone || now - m.OverAt > OverTtl)
        {
          _matches.Remove(m.Id);
          _lobbyDirty = true;
        }
      }
    }

    private void Step(Match m, float dt, Outbox box)
    {
      // paddles (also while paused/countdown so players can position themselves)
      for (var s = 0; s < 2; s++)
      {
        var p = m.P[s];
        if (p.Cpu) CpuThink(m, p, s, dt);
        var oldY = p.Y;
        var maxMove = PaddleMaxSpeed * dt;
        p.Y += Math.Clamp(p.TargetY - p.Y, -maxMove, maxMove);
        var vy = (p.Y - oldY) / Math.Max(dt, 0.0001f);
        p.Vy = p.Vy * 0.6f + vy * 0.4f;
      }

      // presence: socket gone or no input for a while -> pause; everybody back -> short countdown
      var now = Now;
      var absent = Array.FindIndex(m.P, p => !p.Present(now));
      if (absent >= 0 && (m.Phase == "play" || m.Phase == "countdown"))
      {
        m.ResumePhase = m.Phase;
        if (m.Phase == "play")
        {
          // freeze the ball exactly where it is
          m.BvxHold = m.Bvx; m.BvyHold = m.Bvy; m.SpinHold = m.Spin;
        }
        m.Phase = "paused";
        m.PhaseT = DisconnectGrace;
        box.Add(_hub.Clients.Group(m.Group), "ev", new { id = m.Id, k = "pause", side = absent });
        return;
      }
      if (absent < 0 && m.Phase == "paused")
      {
        m.Phase = "countdown";
        m.PhaseT = 2.0;
        m.ResumeKeepsBall = m.ResumePhase == "play";
        if (m.ResumeKeepsBall) { m.Bvx = m.Bvy = m.Spin = 0; }
        box.Add(_hub.Clients.Group(m.Group), "ev", new { id = m.Id, k = "resume" });
        return;
      }

      switch (m.Phase)
      {
        case "countdown":
          m.PhaseT -= dt;
          if (m.PhaseT <= 0)
          {
            m.Phase = "play";
            if (m.ResumeKeepsBall)
            {
              m.Bvx = m.BvxHold; m.Bvy = m.BvyHold; m.Spin = m.SpinHold;
              m.ResumeKeepsBall = false;
            }
            else Serve(m);
            box.Add(_hub.Clients.Group(m.Group), "ev", new { id = m.Id, k = "serve" });
          }
          return;
        case "paused":
          m.PhaseT -= dt;
          for (int i = 0; i < m.P.Length; i++)
          {
            if (m.P[i].Cpu || m.P[i].Present(now)) continue;
            m.PauseUsed[i] += dt;
            // pause budget per player (anti stalling): 15 s per match, then the absent player forfeits
            if (m.PauseUsed[i] > PauseBudget && m.P.Any(o => o != m.P[i] && (o.Cpu || o.Present(now))))
            {
              EndMatch(m, 1 - i, "disconnect", box);
              return;
            }
          }
          if (m.PhaseT <= 0)
          {
            var gone = Array.FindIndex(m.P, p => !p.Present(now));
            var bothGone = m.P.All(p => p.Cpu || !p.Present(now));
            EndMatch(m, gone >= 0 && !bothGone ? 1 - gone : -1, "disconnect", box);
          }
          return;
        case "play":
          break;
        default:
          return;
      }

      var prevX = m.Bx;
      var prevY = m.By;
      m.Bvy += m.Spin * dt;
      m.Spin *= MathF.Exp(-1.6f * dt);
      m.Bx += m.Bvx * dt;
      m.By += m.Bvy * dt;

      // walls
      if (m.By < BallR)
      {
        m.By = BallR + (BallR - m.By);
        m.Bvy = MathF.Abs(m.Bvy);
        m.Spin *= -0.4f;
        box.Add(_hub.Clients.Group(m.Group), "ev", new { id = m.Id, k = "wall", x = R(m.Bx), y = R(m.By) });
      }
      else if (m.By > H - BallR)
      {
        m.By = (H - BallR) - (m.By - (H - BallR));
        m.Bvy = -MathF.Abs(m.Bvy);
        m.Spin *= -0.4f;
        box.Add(_hub.Clients.Group(m.Group), "ev", new { id = m.Id, k = "wall", x = R(m.Bx), y = R(m.By) });
      }

      // paddles: swept test against the paddle face plane
      if (m.Bvx < 0) TryHit(m, 0, prevX, prevY, box);
      else if (m.Bvx > 0) TryHit(m, 1, prevX, prevY, box);

      // goals
      if (m.Bx < -BallR * 2) Goal(m, 1, box);
      else if (m.Bx > W + BallR * 2) Goal(m, 0, box);
    }

    private void TryHit(Match m, int s, float prevX, float prevY, Outbox box)
    {
      var p = m.P[s];
      var face = s == 0 ? PadX + PadW / 2 + BallR : W - PadX - PadW / 2 - BallR;
      var crossed = s == 0 ? prevX >= face - 1f && m.Bx < face : prevX <= face + 1f && m.Bx > face;
      if (!crossed) return;
      var t = Math.Abs(m.Bx - prevX) < 0.0001f ? 1f : (face - prevX) / (m.Bx - prevX);
      var yc = prevY + (m.By - prevY) * Math.Clamp(t, 0f, 1f);
      var reach = PadH / 2 + BallR + HitLeniency;
      if (Math.Abs(yc - p.Y) > reach) return;

      var offset = Math.Clamp((yc - p.Y) / (PadH / 2), -1f, 1f);
      var speed = MathF.Sqrt(m.Bvx * m.Bvx + m.Bvy * m.Bvy);
      speed = Math.Min(MaxSpeed, Math.Max(StartSpeed, speed) * SpeedUp);
      var angle = offset * 0.95f; // up to ~55 deg
      var dir = s == 0 ? 1f : -1f;
      var vx = MathF.Cos(angle) * speed * dir;
      var vy = MathF.Sin(angle) * speed + p.Vy * 0.22f;
      // keep the ball moving forward enough and at the intended speed
      var mag = MathF.Sqrt(vx * vx + vy * vy);
      vx = vx / mag * speed;
      vy = vy / mag * speed;
      if (MathF.Abs(vx) < speed * 0.5f)
      {
        vx = speed * 0.5f * dir;
        vy = MathF.Sign(vy) * MathF.Sqrt(speed * speed - vx * vx);
      }
      m.Bvx = vx;
      m.Bvy = vy;
      // spin from paddle movement: curves the ball against the paddle direction, decays over time
      m.Spin = Math.Clamp(-p.Vy * 0.9f, -1500f, 1500f);
      m.Bx = face;
      m.By = yc;
      m.Hits++;
      p.CpuError = (float)(_rng.NextDouble() - 0.5);
      box.Add(_hub.Clients.Group(m.Group), "ev", new { id = m.Id, k = "hit", side = s, x = R(m.Bx), y = R(m.By), sp = R(speed), n = m.Hits });
    }

    private void Goal(Match m, int scorer, Outbox box)
    {
      m.P[scorer].Score++;
      _lobbyDirty = true;
      var by = m.By;
      box.Add(_hub.Clients.Group(m.Group), "ev", new { id = m.Id, k = "goal", side = scorer, y = R(by), s = new[] { m.P[0].Score, m.P[1].Score } });
      m.ServeDir = scorer == 0 ? 1 : -1; // serve towards the player who conceded
      if (m.P[scorer].Score >= WinScore)
      {
        EndMatch(m, scorer, "score", box);
        return;
      }
      m.Phase = "countdown";
      m.PhaseT = 1.4;
      ResetBall(m);
    }

    /// <summary>The house player: predicts the impact point with wall bounces, has reaction lag, an aiming error and a speed limit.</summary>
    private void CpuThink(Match m, Player p, int s, float dt)
    {
      var target = H / 2;
      var towards = s == 1 ? m.Bvx > 0 : m.Bvx < 0;
      if (m.Phase == "play" && towards)
      {
        var faceX = s == 1 ? W - PadX : PadX;
        var tHit = (faceX - m.Bx) / m.Bvx;
        if (tHit > 0 && tHit < 3)
        {
          var y = m.By + m.Bvy * tHit + 0.5f * m.Spin * tHit * tHit * 0.6f;
          // unfold wall reflections
          var span = H - 2 * BallR;
          var u = (y - BallR) % (2 * span);
          if (u < 0) u += 2 * span;
          y = BallR + (u > span ? 2 * span - u : u);
          var dist = Math.Abs(faceX - m.Bx);
          // gets less precise the faster the ball is
          var speed = MathF.Sqrt(m.Bvx * m.Bvx + m.Bvy * m.Bvy);
          var err = p.CpuError * (30f + speed * 0.07f);
          target = dist < W * 0.75f ? y + err : (y + H / 2) / 2;
        }
      }
      var maxSpeed = 470f + Math.Min(m.Hits, 12) * 14f;
      var step = maxSpeed * dt;
      p.TargetY = Math.Clamp(p.TargetY + Math.Clamp(target - p.TargetY, -step, step), PadH / 2, H - PadH / 2);
    }

    // ===================================================================== DTOs / helpers

    private static double R(float v) => Math.Round(v, 1);

    private object StateDto(Match m) => new
    {
      id = m.Id,
      t = Math.Round(Now * 1000),
      ph = m.Phase,
      pt = Math.Round(m.PhaseT, 2),
      b = new[] { R(m.Bx), R(m.By), R(m.Bvx), R(m.Bvy) },
      p = new[] { R(m.P[0].Y), R(m.P[1].Y) },
      s = new[] { m.P[0].Score, m.P[1].Score },
      c = new[] { m.P[0].Present(Now), m.P[1].Present(Now) },
      r = new[] { m.P[0].WantsRematch && !m.P[0].Cpu, m.P[1].WantsRematch && !m.P[1].Cpu },
      l = new[] { m.P[0].Left, m.P[1].Left },
      w = m.Winner,
      er = m.EndReason,
      n = m.Hits,
    };

    private void MarkStateDirty(Match m, Outbox box) => box.Add(_hub.Clients.Group(m.Group), "state", StateDto(m));

    private object MatchDto(Match m, int slot) => new
    {
      id = m.Id,
      slot,
      names = new[] { m.P[0].Name, m.P[1].Name },
      userIds = new[] { m.P[0].UserId, m.P[1].UserId },
      cpu = m.IsCpu,
      stake = m.Stake,
      pot = m.Stake * 2,
      winScore = WinScore,
      field = new { w = W, h = H, padX = PadX, padW = PadW, padH = PadH, ballR = BallR },
      state = StateDto(m),
    };

    private static object InviteDto(Invite i) => new
    {
      id = i.Id,
      fromId = i.FromId,
      fromName = i.FromName,
      toId = i.ToId,
      toName = i.ToName,
      stake = i.Stake,
      open = !i.ToId.HasValue,
    };

    private Match ActiveMatchOf(int userId) =>
      _matches.Values.FirstOrDefault(m => m.Phase != "over" && m.P.Any(p => !p.Cpu && p.UserId == userId));

    private List<string> ConnIdsOf(int userId) => _conns.Values.Where(c => c.UserId == userId).Select(c => c.Id).ToList();

    private void CancelInvitesFrom(Conn c, string reason, Outbox box)
    {
      foreach (var inv in _invites.Values.Where(i => i.FromConn == c.Id && !i.Starting).ToList())
        CloseInvite(inv, reason, $"{inv.FromName} hat die Herausforderung zurückgezogen.", box);
    }

    private void CloseInvite(Invite inv, string reason, string message, Outbox box)
    {
      _invites.Remove(inv.Id);
      var ids = ConnIdsOf(inv.FromId);
      if (inv.ToId.HasValue) ids.AddRange(ConnIdsOf(inv.ToId.Value));
      if (ids.Count > 0) box.Add(_hub.Clients.Clients(ids), "inviteClosed", new { id = inv.Id, reason, message });
      _lobbyDirty = true;
    }

    private void BuildLobby(Outbox box)
    {
      var busy = new HashSet<int>(_matches.Values.Where(m => m.Phase != "over").SelectMany(m => m.P.Where(p => !p.Cpu).Select(p => p.UserId)));
      var users = _conns.Values
        .GroupBy(c => c.UserId)
        .Select(g => new
        {
          id = g.Key,
          name = g.First().Name,
          status = busy.Contains(g.Key) ? "playing" : g.Any(c => c.InLobby) ? "lobby" : "online",
        })
        .OrderBy(u => u.status == "lobby" ? 0 : u.status == "playing" ? 1 : 2)
        .ThenBy(u => u.name)
        .ToList();
      var matches = _matches.Values.Where(m => m.Phase != "over").Select(m => new
      {
        id = m.Id,
        names = new[] { m.P[0].Name, m.P[1].Name },
        s = new[] { m.P[0].Score, m.P[1].Score },
        stake = m.Stake,
        cpu = m.IsCpu,
      }).ToList();
      var invites = _invites.Values.Where(i => !i.Starting).ToList();

      foreach (var group in _conns.Values.GroupBy(c => c.UserId))
      {
        var uid = group.Key;
        var mine = invites.Where(i => !i.ToId.HasValue || i.ToId == uid || i.FromId == uid).Select(InviteDto).ToList();
        box.Add(_hub.Clients.Clients(group.Select(c => c.Id).ToList()), "lobby", new { users, invites = mine, matches });
      }
    }

    private void Flush(Outbox box)
    {
      foreach (var (target, method, arg) in box.Items)
      {
        try
        {
          _ = target.SendAsync(method, arg);
        }
        catch (Exception ex)
        {
          _log.LogDebug(ex, "Pong send failed");
        }
      }
    }
  }
}
