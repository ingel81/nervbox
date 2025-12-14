using Microsoft.AspNetCore.SignalR;
using NervboxDeamon.DbModels;
using System;
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

    public Task SendMessage(int userId, string message)
    {
      var chatMessage = new ChatMessage
      {
        UserId = userId,
        Message = message,
        CreatedAt = DateTime.UtcNow
      };

      Db.ChatMessages.Add(chatMessage);
      Db.SaveChanges();

      var user = Db.Users.Find(userId);

      return Clients.All.SendAsync("message", new
      {
        UserId = userId,
        Username = user?.Username ?? "Unknown",
        Message = message,
        CreatedAt = chatMessage.CreatedAt
      });
    }
  }
}
