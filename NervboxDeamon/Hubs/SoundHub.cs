using Microsoft.AspNetCore.SignalR;
using System.Threading.Tasks;

namespace NervboxDeamon.Hubs
{
  public class SoundHub : Hub
  {
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
  }
}
