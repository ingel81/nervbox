using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using NervboxDeamon.Services;

namespace NervboxDeamon.Hubs
{
  /// <summary>
  /// LAN-Pong realtime hub (/ws/pongHub). Every logged-in player keeps one connection (for invite toasts),
  /// the game itself runs in PongService. JWT comes as ?access_token (see Startup JwtBearerEvents).
  ///
  /// Client -> server: EnterLobby, LeaveLobby, Challenge(targetUserId|null, stake), CancelInvite, Accept, Decline,
  ///                   PlayCpu, Spectate(matchId), Input(matchId, y), Leave(matchId), Rematch(matchId), Rejoin
  /// Server -> client: lobby, invite, inviteClosed, match, state, ev, notice
  /// Methods return an error text (German) or null.
  /// </summary>
  [Authorize]
  public class PongHub : Hub
  {
    private readonly PongService _pong;

    public PongHub(PongService pong)
    {
      _pong = pong;
    }

    private int UserId => int.TryParse(Context.User?.Identity?.Name, out var id) ? id : throw new HubException("Nicht angemeldet.");
    private string UserName => Context.User?.FindFirst("userName")?.Value ?? "?";

    public override Task OnConnectedAsync()
    {
      _pong.Connected(Context.ConnectionId, UserId, UserName);
      return base.OnConnectedAsync();
    }

    public override Task OnDisconnectedAsync(Exception exception)
    {
      _pong.Disconnected(Context.ConnectionId);
      return base.OnDisconnectedAsync(exception);
    }

    public void EnterLobby() => _pong.EnterLobby(Context.ConnectionId);
    public void LeaveLobby() => _pong.LeaveLobby(Context.ConnectionId);
    public string Challenge(int? targetUserId, int stake) => _pong.Challenge(Context.ConnectionId, targetUserId, stake);
    public string CancelInvite(string inviteId) => _pong.CancelInvite(Context.ConnectionId, inviteId);
    public string Accept(string inviteId) => _pong.Accept(Context.ConnectionId, inviteId);
    public string Decline(string inviteId) => _pong.Decline(Context.ConnectionId, inviteId);
    public string PlayCpu() => _pong.PlayCpu(Context.ConnectionId);
    public object Spectate(string matchId) => _pong.Spectate(Context.ConnectionId, matchId);
    public void Input(string matchId, float y) => _pong.Input(Context.ConnectionId, matchId, y);
    public void Leave(string matchId) => _pong.Leave(Context.ConnectionId, matchId);
    public string Rematch(string matchId) => _pong.Rematch(Context.ConnectionId, matchId);
    public object Rejoin() => _pong.Rejoin(Context.ConnectionId);
  }
}
