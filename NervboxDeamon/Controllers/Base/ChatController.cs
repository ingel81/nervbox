using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace NervboxDeamon.Controllers.Base
{
    [Route("api/[controller]")]
    [ApiController]
    public class ChatController : NervboxBaseController<ChatController>
  {
        // GET: api/Chat
        [HttpGet]
        public IActionResult Get()
        {
          return Ok (DbContext.ChatMessages.OrderBy(a => a.Date).Take(100).ToList());
        }
    }
}
