using Microsoft.AspNetCore.SignalR;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace NervboxDeamon.Hubs
{
  public class ChatHub : Hub
  {
    public Task SendMessage(object msg)
    {
      return Clients.All.SendAsync("message", msg);
    }
  }
}
