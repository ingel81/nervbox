using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using NervboxDeamon.Controllers.Base;
using NervboxDeamon.DbModels;

namespace NervboxDeamon.Controllers
{
  [Route("api/[controller]")]
  [ApiController]
  public class ValuesController : NervboxBaseController<ValuesController>
  {
    // GET api/values
    [HttpGet]
    public ActionResult<IEnumerable<Record>> Get()
    {
      Logger.LogTrace("get values called - verbose");
      Logger.LogDebug("get values called - debug");
      Logger.LogInformation("get values called - info");
      Logger.LogWarning("get values called - warning");
      Logger.LogError("get values called - error");
      Logger.LogCritical("get values called - fatal");

      return DbContext.Records.Take(100).ToList();
    }
  }
}
