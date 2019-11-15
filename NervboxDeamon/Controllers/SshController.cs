using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using NervboxDeamon.Controllers.Base;
using NervboxDeamon.Models.View;
using NervboxDeamon.Services;

namespace NervboxDeamon.Controllers
{
  /// <summary>
  /// Controller für das Absetzen von SSH-Commands
  /// </summary>
  [Authorize]
  [Route("api/[controller]")]
  [ApiController]
  public class SshController : NervboxBaseController<SshController>
  {
    //injected
    private ISshService SshService { get; }
    [Obsolete]
    private IHostingEnvironment Environment { get; }

    [Obsolete]
    public SshController(ISshService SshService, IHostingEnvironment environment)
    {
      this.SshService = SshService;
      this.Environment = environment;
    }

    [AllowAnonymous]
    [HttpPost]
    [Route("sshcmdraw")]
    public IActionResult SendCmd(SshCmdRequest model)
    {
      try
      {
        this.SshService.SendCmd(model.Command);
        return Ok();
      }
      catch (Exception ex)
      {
        return StatusCode(500, new
        {
          Error = ex.Message,
          Stacktrace = ex.StackTrace
        });
      }
    }

    [AllowAnonymous]
    [HttpPost]
    [Route("sshcmd")]
    public IActionResult SendReadCmd(SshCmdRequest model)
    {
      try
      {
        string response = null;
        string error = null;

        int exitStatus = -1;

        if (model.TimeoutMs != 0)
        {
          response = this.SshService.SendReadCmd(model.Command, out error, out exitStatus, model.TimeoutMs);
        }
        else
        {
          response = this.SshService.SendReadCmd(model.Command, out error, out exitStatus);
        }

        return Ok(new
        {
          Response = response,
          Error = error,
          ExitStatus = exitStatus
        });

      }
      catch (Exception ex)
      {
        return StatusCode(500, new
        {
          Error = ex.Message,
          Stacktrace = ex.StackTrace
        });
      }
    }

  }
}
