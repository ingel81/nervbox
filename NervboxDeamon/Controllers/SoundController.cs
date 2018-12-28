using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using NervboxDeamon.Controllers.Base;
using NervboxDeamon.Services;

namespace NervboxDeamon.Controllers
{
  [AllowAnonymous]
  [Route("api/[controller]")]
  [ApiController]
  public class SoundController : NervboxBaseController<SoundController>
  {
    //injected
    private IHostingEnvironment Environment { get; }
    private ISoundService SoundService { get; }
    private IHttpContextAccessor Accessor { get; }

    public SoundController(ISoundService soundService, IHostingEnvironment environment, IHttpContextAccessor accessor)
    {
      this.SoundService = soundService;
      this.Environment = environment;
      this.Accessor = accessor;
    }

    [HttpGet]
    public IActionResult GetAllValidSounds()
    {
      return Ok(this.DbContext.Sounds.Where(s => s.Allowed == true && s.Valid == true).Select(s => new
      {
        Hash = s.Hash,
        FileName = s.FileName,
        Allowed = s.Allowed,
        Valid = s.Valid,
        Size = s.Size,
        Played = s.Usages.Count()
      }).ToList());
    }

    [AllowAnonymous]
    [HttpGet]
    [Route("{soundId}/play")]
    public IActionResult PlaySound(string soundId)
    {

      try
      {
        this.SoundService.PlaySound(soundId, Accessor.HttpContext.Connection.RemoteIpAddress.ToString());

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
    [HttpGet]
    [Route("statistics/topusers")]
    public IActionResult TopUsers()
    {

      try
      {
        return Ok(this.DbContext.SoundUsages.GroupBy(g => g.Initiator).Select(g => new { Name = g.Key, Count = g.Count() }).OrderByDescending(g => g.Count).Take(10));
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
    [HttpGet]
    [Route("statistics/topsounds")]
    public IActionResult TopSounds()
    {
      try
      {
        var affe = this.DbContext.SoundUsages.Join(this.DbContext.Sounds, outer => outer.SoundHash, inner => inner.Hash, (usages, sounds) => new { usages, sounds }).GroupBy(a => a.usages.SoundHash).Select(a => new
        {
          Hash = a.Key,
          Name = a.First().sounds.FileName,
          Count = a.Count()
        }).OrderByDescending(a => a.Count).Take(25);

        return Ok(affe);
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
    [HttpGet]
    [Route("killAll")]
    public IActionResult KillAll()
    {
      this.SoundService.KillAll();
      return Ok();
    }
  }
}