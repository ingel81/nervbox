using Microsoft.AspNetCore.SignalR;
using NervboxDeamon.DbModels;
using NervboxDeamon.Services;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace NervboxDeamon.Hubs
{
  public class ChatHub : Hub
  {
    private NervboxDBContext Db { get; }
    private ISoundService SoundService { get; }

    public ChatHub(NervboxDBContext db, ISoundService soundService)
    {
      this.Db = db;
      this.SoundService = soundService;
    }

    public Task SendMessage(ChatMessage msg)
    {
      msg.Date = DateTime.Now;
      Db.ChatMessages.Add(msg);
      Db.SaveChanges();

      this.SoundService.TTS(msg.Message, msg.UserId);

      return Clients.All.SendAsync("message", msg);
    }
  }
}
