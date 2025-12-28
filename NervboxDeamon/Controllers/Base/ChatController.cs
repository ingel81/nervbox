using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.AspNetCore.Mvc;
using NervboxDeamon.DbModels;

namespace NervboxDeamon.Controllers.Base
{
  [Route("api/[controller]")]
  [ApiController]
  public class ChatController : NervboxBaseController<ChatController>
  {
    [HttpGet]
    public IActionResult Get(
      [FromQuery] int limit = 25,
      [FromQuery] int? beforeId = null,
      [FromQuery] string type = null) // "chat", "activity", or null for both
    {
      limit = Math.Clamp(limit, 1, 100);

      // If type is specified, load only that type (for "load older" requests)
      if (!string.IsNullOrEmpty(type))
      {
        return GetByType(type, limit, beforeId);
      }

      // Initial load: get both types separately to ensure both tabs have content
      var chatMessages = GetMessagesByType(isActivity: false, limit, beforeId);
      var activityMessages = GetMessagesByType(isActivity: true, limit, beforeId);

      // Combine and sort by ID
      var combined = chatMessages.messages.Concat(activityMessages.messages)
        .OrderBy(m => m.Id)
        .ToList();

      return Ok(new
      {
        messages = combined,
        hasMoreChat = chatMessages.hasMore,
        hasMoreActivity = activityMessages.hasMore,
        // Legacy compatibility
        hasMore = chatMessages.hasMore || activityMessages.hasMore
      });
    }

    private IActionResult GetByType(string type, int limit, int? beforeId)
    {
      bool isActivity = type == "activity";
      var result = GetMessagesByType(isActivity, limit, beforeId);

      return Ok(new
      {
        messages = result.messages.OrderBy(m => m.Id).ToList(),
        hasMore = result.hasMore
      });
    }

    private (List<ChatMessageDto> messages, bool hasMore) GetMessagesByType(bool isActivity, int limit, int? beforeId)
    {
      var query = DbContext.ChatMessages.AsQueryable();

      // Filter by type
      if (isActivity)
      {
        query = query.Where(m => m.MessageType == ChatMessageType.ShekelTransaction);
      }
      else
      {
        query = query.Where(m => m.MessageType != ChatMessageType.ShekelTransaction);
      }

      // If beforeId is set, get messages older than that
      if (beforeId.HasValue)
      {
        query = query.Where(m => m.Id < beforeId.Value);
      }

      var results = query
        .OrderByDescending(m => m.Id)
        .Take(limit)
        .Select(m => new ChatMessageDto
        {
          Id = m.Id,
          UserId = m.UserId,
          Username = m.User != null ? m.User.Username : "Unknown",
          Message = m.Message,
          MessageType = m.MessageType == ChatMessageType.Gif ? "gif"
                      : m.MessageType == ChatMessageType.ShekelTransaction ? "shekel-transaction"
                      : "text",
          GifUrl = m.GifUrl,
          CreatedAt = m.CreatedAt
        })
        .ToList();

      // Check if there are more older messages of this type
      var oldestId = results.LastOrDefault()?.Id ?? 0;
      var hasMore = oldestId > 0 && query.Any(m => m.Id < oldestId);

      return (results, hasMore);
    }
  }

  public class ChatMessageDto
  {
    public int Id { get; set; }
    public int UserId { get; set; }
    public string Username { get; set; }
    public string Message { get; set; }
    public string MessageType { get; set; }
    public string GifUrl { get; set; }
    public DateTime CreatedAt { get; set; }
  }
}
