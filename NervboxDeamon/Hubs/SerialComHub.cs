using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Protocol;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using NervboxDeamon.Services;

namespace NervboxDeamon.Hubs
{
  public class SerialComHub : Hub
  {
    //public void NewSerialMessage(SerialHistoryEntry message)
    //{
    //  Clients.All.SendAsync("newSerialMessage", message);
    //}
  }
}
