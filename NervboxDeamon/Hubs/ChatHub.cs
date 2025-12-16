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
        MessageType = ChatMessageType.Text,
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
        MessageType = "text",
        GifUrl = (string)null,
        CreatedAt = chatMessage.CreatedAt
      });
    }

    public Task SendGif(int userId, string gifUrl)
    {
      var chatMessage = new ChatMessage
      {
        UserId = userId,
        Message = "[GIF]",
        MessageType = ChatMessageType.Gif,
        GifUrl = gifUrl,
        CreatedAt = DateTime.UtcNow
      };

      Db.ChatMessages.Add(chatMessage);
      Db.SaveChanges();

      var user = Db.Users.Find(userId);

      return Clients.All.SendAsync("message", new
      {
        UserId = userId,
        Username = user?.Username ?? "Unknown",
        Message = "[GIF]",
        MessageType = "gif",
        GifUrl = gifUrl,
        CreatedAt = chatMessage.CreatedAt
      });
    }
  }
}
