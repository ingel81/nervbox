using System;
using System.Linq;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using NervboxDeamon.Controllers.Base;
using NervboxDeamon.Services;

namespace NervboxDeamon.Controllers
{
  [Route("api/[controller]")]
  [ApiController]
  public class SoundController : NervboxBaseController<SoundController>
  {
    //injected
    private IWebHostEnvironment Environment { get; }
    private ISoundService SoundService { get; }
    private IHttpContextAccessor Accessor { get; }

    public SoundController(ISoundService soundService, IWebHostEnvironment environment, IHttpContextAccessor accessor)
    {
      this.SoundService = soundService;
      this.Environment = environment;
      this.Accessor = accessor;
    }

    [HttpGet]
    public IActionResult GetAllSounds()
    {
      var sounds = this.DbContext.Sounds
        .Where(s => s.Enabled)
        .Select(s => new
        {
          s.Hash,
          s.Name,
          s.FileName,
          s.SizeBytes,
          s.DurationMs,
          s.Enabled,
          s.CreatedAt,
          Tags = s.SoundTags.Select(st => st.Tag.Name).ToList(),
          PlayCount = s.Usages.Count()
        })
        .ToList();

      return Ok(sounds);
    }

    [HttpGet]
    [Route("{soundId}/play")]
    public IActionResult PlaySound(string soundId)
    {
      try
      {
        this.SoundService.PlaySound(soundId, this.UserId);
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

    [HttpGet]
    [Route("statistics/topusers")]
    public IActionResult TopUsers()
    {
      try
      {
        return Ok(this.DbContext.SoundUsages.GroupBy(g => new { id = g.User.Id, name = g.User.Username }).Select(g => new
        {
          PlayedById = g.Key.id,
          Name = g.Key.name,
          Count = g.Count()
        }).OrderByDescending(g => g.Count).Take(25));
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

    [HttpGet]
    [Route("statistics/topsounds")]
    public IActionResult TopSounds()
    {
      try
      {

        var affe = this.DbContext.SoundUsages.Join(this.DbContext.Sounds, outer => outer.SoundHash, inner => inner.Hash, (usages, sounds) => new { usages, sounds }).GroupBy((a) => new { hash = a.usages.SoundHash, fileName = a.sounds.FileName }).Select(a => new
        {
          Hash = a.Key.hash,
          Name = a.Key.fileName,
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

    [HttpGet]
    [Route("killAll")]
    public IActionResult KillAll()
    {
      this.SoundService.KillAll();
      return Ok();
    }
  }
}