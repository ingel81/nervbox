using Microsoft.AspNetCore.SignalR;
using NervboxDeamon.Services;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;

namespace NervboxDeamon.Hubs
{
  public class SoundHub : Hub
  {
    private readonly IVoiceService _voices;

    public SoundHub(IVoiceService voices)
    {
      _voices = voices;
    }

    public Task NotifySoundPlayed(string soundHash, string fileName, string userName)
    {
      return Clients.All.SendAsync("soundPlayed", new
      {
        SoundHash = soundHash,
        FileName = fileName,
        UserName = userName,
        Timestamp = System.DateTime.UtcNow
      });
    }

    /// <summary>User id from the JWT (?access_token= on the hub connection); null for guests.</summary>
    private int? CallerId
    {
      get
      {
        var v = Context.User?.Claims.FirstOrDefault(c => c.Type == ClaimTypes.Name)?.Value;
        return int.TryParse(v, out var id) ? id : null;
      }
    }

    /// <summary>
    /// Live control of a running mixer voice ("press + drag" on a pad), ~20 calls/s while dragging.
    /// Only the initiator. rate 0.5–2, filter -1 (low-pass) … +1 (high-pass), wobble 0–1.
    /// </summary>
    public bool ModulateVoice(int voiceId, double rate, double filter, double wobble)
    {
      var uid = CallerId;
      return uid.HasValue && _voices.Modulate(voiceId, uid.Value, rate, filter, wobble);
    }

    /// <summary>Browser mode: the initiator's browser reports that its voice ended naturally.</summary>
    public bool ReportVoiceEnded(int voiceId)
    {
      var uid = CallerId;
      return uid.HasValue && _voices.ReportEnded(voiceId, uid.Value);
    }
  }
}
