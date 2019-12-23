using Microsoft.AspNetCore.SignalR;
using NervboxDeamon.DbModels;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace NervboxDeamon.Hubs
{
  public class ChatHub : Hub
  {
    private NervboxDBContext Db { get; }

    public ChatHub(NervboxDBContext db)
    {
      this.Db = db;
    }

    public Task SendMessage(ChatMessage msg)
    {
      msg.Date = DateTime.Now;
      Db.ChatMessages.Add(msg);
      Db.SaveChanges();

      return Clients.All.SendAsync("message", msg);
    }
  }
}
