using System;
using System.IO;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using NervboxDeamon.Controllers.Base;
using NervboxDeamon.Services;

namespace NervboxDeamon.Controllers
{
  /// <summary>
  /// Controller für System-Informationen (read-only)
  /// </summary>
  [Route("api/[controller]")]
  [ApiController]
  public class SystemController : NervboxBaseController<SystemController>
  {
    private ISystemService SystemService { get; }
    private IWebHostEnvironment Environment { get; }

    public SystemController(ISystemService systemService, IWebHostEnvironment environment)
    {
      this.SystemService = systemService;
      this.Environment = environment;
    }

    /// <summary>
    /// Get basic system/version info
    /// </summary>
    [HttpGet]
    [Route("info")]
    [AllowAnonymous]
    public IActionResult GetSystemInfo()
    {
      return Ok(new
      {
        Version = new
        {
          DaemonVersion = this.SystemService.DaemonVersion,
          SvnRevision = this.SystemService.SvnRevision,
          SvnDate = this.SystemService.SvnDate,
          SvnAuthor = this.SystemService.SvnAuthor
        },
        Date = DateTime.Now,
        DateUTC = DateTime.UtcNow
      });
    }

    /// <summary>
    /// Get changelog
    /// </summary>
    [AllowAnonymous]
    [HttpGet]
    [Route("changelog")]
    public IActionResult GetChangeLog()
    {
      var path = Path.Combine(Environment.ContentRootPath, "docs", "CHANGELOG.txt");
      if (!System.IO.File.Exists(path))
      {
        return NotFound(new { error = "Changelog not found" });
      }
      var content = System.IO.File.ReadAllText(path);
      return Ok(new { changeLog = content });
    }

    /// <summary>
    /// Get current server date/time
    /// </summary>
    [AllowAnonymous]
    [HttpGet]
    [Route("date")]
    public IActionResult GetCurrentDate()
    {
      return Ok(new { date = DateTime.Now, dateUtc = DateTime.UtcNow });
    }
  }
}
