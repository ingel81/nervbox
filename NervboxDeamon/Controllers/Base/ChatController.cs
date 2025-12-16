using System;
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
    public IActionResult Get([FromQuery] int limit = 25, [FromQuery] int? beforeId = null)
    {
      limit = Math.Clamp(limit, 1, 100);

      var query = DbContext.ChatMessages.AsQueryable();

      // If beforeId is set, get messages older than that
      if (beforeId.HasValue)
      {
        query = query.Where(m => m.Id < beforeId.Value);
      }

      var results = query
        .OrderByDescending(m => m.Id)
        .Take(limit)
        .Select(m => new
        {
          m.Id,
          m.UserId,
          Username = m.User != null ? m.User.Username : "Unknown",
          m.Message,
          MessageType = m.MessageType == ChatMessageType.Gif ? "gif" : "text",
          m.GifUrl,
          m.CreatedAt
        })
        .ToList();

      results.Reverse();

      // Check if there are more older messages
      var oldestId = results.FirstOrDefault()?.Id ?? 0;
      var hasMore = oldestId > 0 && DbContext.ChatMessages.Any(m => m.Id < oldestId);

      return Ok(new { messages = results, hasMore });
    }
  }
}
