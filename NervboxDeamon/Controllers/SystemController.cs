using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Serilog.Events;
using Serilog.Formatting.Compact.Reader;
using NervboxDeamon.Controllers.Base;
using NervboxDeamon.Helpers;
using NervboxDeamon.Models.Settings;
using NervboxDeamon.Models.View;
using NervboxDeamon.Services;
using NervboxDeamon.Services.Interfaces;

namespace NervboxDeamon.Controllers
{
  /// <summary>
  /// Controller für die Verwendung von Systemfunktionen
  /// </summary>
  [Authorize]
  [Route("api/[controller]")]
  [ApiController]
  public class SystemController : NervboxBaseController<SystemController>
  {
    //injected
    private ISystemService SystemService { get; }
    private IWebHostEnvironment Environment { get; }
    private IConfiguration Configuration { get; }

    public SystemController(
      ISystemService systemService,
      IWebHostEnvironment environment,
      IConfiguration configuration

      )
    {
      this.SystemService = systemService;
      this.Environment = environment;
      this.Configuration = configuration;
    }

    // POST api/<controller>
    [HttpPost]
    [Route("configureNetwork")]
    public async Task<IActionResult> ConfigureNetwork()
    {
      var result = await Task.FromResult(true);
      this.SystemService.ApplyNetworkConfig();
      return Ok();
    }

    // POST api/<controller>
    [AllowAnonymous]
    [HttpPost]
    [Route("scanWifi")]
    public IActionResult ScanWifiNetworks()
    {
      var result = this.SystemService.ScanWifiNetworks("wlan0");
      return Ok(result);
    }

    // POST api/<controller>
    [HttpPost]
    [Route("reboot")]
    public IActionResult Reboot()
    {
      this.SystemService.Reboot();
      return Ok();
    }

    // POST api/<controller>
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

    // POST api/<controller>
    [HttpGet]
    [Route("systemlog")]
    public IActionResult GetSystemLog()
    {
      List<LogEvent> logs = new List<LogEvent>();

      // configure strongly typed settings objects
      var logPath = Configuration.GetSection("AppSettings").Get<AppSettings>().LogPath;

      DirectoryInfo di = new DirectoryInfo(logPath);
      di = di.Parent;

      DateTime now = DateTime.Now;
      var patternYesterday = $"log-{now.AddDays(-1).ToString("yyyyMMdd")}*.log";
      var patternToday = $"log-{now.ToString("yyyyMMdd")}*.log";

      //get log files and sort 
      var yesterdayLogs = di.GetFiles(patternYesterday).ToList();
      var todayLogs = di.GetFiles(patternToday).ToList();

      yesterdayLogs = yesterdayLogs.OrderBy(o => o.CreationTime).ToList();
      todayLogs = todayLogs.OrderBy(o => o.CreationTime).ToList();

      List<FileInfo> logfiles = new List<FileInfo>();
      logfiles.AddRange(yesterdayLogs);
      logfiles.AddRange(todayLogs);

      string result = string.Empty;
      foreach (var fi in logfiles)
      {
        using (var clef = System.IO.File.Open(fi.FullName, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
        {
          TextReader tr = new StreamReader(clef);
          var reader = new LogEventReader(tr);

          LogEvent evt;
          while (reader.TryRead(out evt))
          {
            logs.Add(evt);
          }
        }
      }

      logs.Reverse();
      return Ok(new { Logs = logs });
    }

    [AllowAnonymous]
    [HttpPost, DisableRequestSizeLimit]
    [Route("uploadUpdate")]
    [RequestSizeLimit(262144000)] //250 MB max
    public async Task<IActionResult> UploadUpdate()
    {
      bool validUpdate = false;
      string message = string.Empty;

      var nervboxRootDirectory = new DirectoryInfo(Environment.ContentRootPath);                                              // /home/pi/nervbox
      var updateDirectory = new DirectoryInfo(Path.Combine(Environment.ContentRootPath, "update"));                         // /home/pi/nervbox/update                                
      var installDirectory = new DirectoryInfo(Path.Combine(nervboxRootDirectory.Parent.FullName, "nervbox_new"));              // /home/pi/nervbox_new

      try
      {
        var file = Request.Form.Files[0];

        if (updateDirectory.Exists)
        {
          updateDirectory.Delete(true);
        }

        if (installDirectory.Exists)
        {
          installDirectory.Delete(true);
        }

        if (file.Length > 0)
        {
          updateDirectory.Create();

          string fileName = ContentDispositionHeaderValue.Parse(file.ContentDisposition).FileName.Trim('"');
          string uploadFilePath = Path.Combine(updateDirectory.FullName, fileName);
          using (var stream = new FileStream(uploadFilePath, FileMode.Create))
          {
            await file.CopyToAsync(stream);
          }

          ZipFile.ExtractToDirectory(uploadFilePath, updateDirectory.FullName);
          string checkSumShould = System.IO.File.ReadAllText(Path.Combine(updateDirectory.FullName, "release.zip.md5")).Split(" ", StringSplitOptions.RemoveEmptyEntries)[0].Replace("\r\n", "").ToLower();
          string checkSumIs = string.Empty;

          using (var md5 = MD5.Create())
          {
            using (var stream = System.IO.File.OpenRead(Path.Combine(updateDirectory.FullName, "release.zip")))
            {
              checkSumIs = BitConverter.ToString(md5.ComputeHash(stream)).Replace("-", "").ToLower();
            }
          }

          validUpdate = checkSumIs.Equals(checkSumShould);
          if (validUpdate)
          {
            installDirectory.Create();
            ZipFile.ExtractToDirectory(Path.Combine(updateDirectory.FullName, "release.zip"), installDirectory.FullName);
          }
          else
          {
            message = $"The update file is corrupted (hash-mismatch).";
          }
        }
        else
        {
          message = $"No files received.";
        }

      }
      catch (System.Exception ex)
      {
        if (installDirectory.Exists)
        {
          installDirectory.Delete(true);
        }

        validUpdate = false;
        message = ex.ToString();
      }

      return Ok(new
      {
        Valid = validUpdate,
        Message = message
      });

    }

    [AllowAnonymous]
    [HttpGet]
    [Route("changelog")]
    public IActionResult GetChangeLog()
    {
      var path = Path.Combine(Environment.ContentRootPath, "docs", "CHANGELOG.txt");
      var content = System.IO.File.ReadAllText(path);

      return Ok(new { changeLog = content });
    }

    [AllowAnonymous]
    [HttpGet]
    [Route("date")]
    public IActionResult GetCurrentDate()
    {
      var dateUtc = DateTime.UtcNow;
      var date = DateTime.Now;
      return Ok(new { date = date, dateUtc = dateUtc });
    }

  }
}
