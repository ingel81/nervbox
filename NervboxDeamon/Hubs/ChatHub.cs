using Microsoft.AspNetCore.SignalR;
using NervboxDeamon.DbModels;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace NervboxDeamon.Hubs
{
  public class ChatHub : Hub
  {
    private NervboxDBContext Db { get; }

    // Rate limiting: Track message timestamps per user
    private static readonly ConcurrentDictionary<int, List<DateTime>> _userMessageTimes = new();
    private static readonly ConcurrentDictionary<int, List<DateTime>> _userGifTimes = new();

    // Limits
    private const int MaxMessagesPerMinute = 15;
    private const int MaxGifsPerMinute = 5;
    private const double MinSecondsBetweenMessages = 0.5;

    public ChatHub(NervboxDBContext db)
    {
      this.Db = db;
    }

    private (bool allowed, string reason) CheckRateLimit(int userId, bool isGif)
    {
      var now = DateTime.UtcNow;
      var oneMinuteAgo = now.AddMinutes(-1);

      // Get or create timestamp list
      var times = isGif
        ? _userGifTimes.GetOrAdd(userId, _ => new List<DateTime>())
        : _userMessageTimes.GetOrAdd(userId, _ => new List<DateTime>());

      lock (times)
      {
        // Clean old entries
        times.RemoveAll(t => t < oneMinuteAgo);

        // Check messages per minute
        var limit = isGif ? MaxGifsPerMinute : MaxMessagesPerMinute;
        if (times.Count >= limit)
        {
          var waitSeconds = (int)Math.Ceiling((times.First().AddMinutes(1) - now).TotalSeconds);
          return (false, $"Zu viele Nachrichten. Warte {waitSeconds} Sekunden.");
        }

        // Check cooldown (only for text messages)
        if (!isGif && times.Count > 0)
        {
          var lastMessage = times.Last();
          var secondsSinceLast = (now - lastMessage).TotalSeconds;
          if (secondsSinceLast < MinSecondsBetweenMessages)
          {
            return (false, "Bitte warte kurz zwischen Nachrichten.");
          }
        }

        // Add timestamp
        times.Add(now);
        return (true, null);
      }
    }

    public Task SendMessage(int userId, string message)
    {
      // Check rate limit
      var (allowed, reason) = CheckRateLimit(userId, isGif: false);
      if (!allowed)
      {
        return Clients.Caller.SendAsync("rateLimit", reason);
      }

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
      // Check rate limit (stricter for GIFs)
      var (allowed, reason) = CheckRateLimit(userId, isGif: true);
      if (!allowed)
      {
        return Clients.Caller.SendAsync("rateLimit", reason);
      }

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
