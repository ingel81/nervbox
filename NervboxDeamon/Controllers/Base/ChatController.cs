using System.Linq;
using Microsoft.AspNetCore.Mvc;

namespace NervboxDeamon.Controllers.Base
{
  [Route("api/[controller]")]
  [ApiController]
  public class ChatController : NervboxBaseController<ChatController>
  {
    [HttpGet]
    public IActionResult Get()
    {
      var results = DbContext.ChatMessages
        .OrderByDescending(m => m.CreatedAt)
        .Take(100)
        .Select(m => new
        {
          m.Id,
          m.UserId,
          Username = m.User != null ? m.User.Username : "Unknown",
          m.Message,
          m.CreatedAt
        })
        .ToList();

      results.Reverse();
      return Ok(results);
    }
  }
}
