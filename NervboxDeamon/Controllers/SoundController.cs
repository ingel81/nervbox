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

        [HttpGet]
        [Route("{soundId}/play")]
        public IActionResult PlaySound(string soundId)
        {
            var ip = Accessor.HttpContext.Connection.RemoteIpAddress.ToString();

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
                return Ok(this.DbContext.SoundUsages.GroupBy(g => new { id = g.User.Id, name = g.User.FirstName + " " + g.User.LastName }).Select(g => new
                {
                    PlayedById = g.Key.id,
                    Name = g.Key.name,
                    Count = g.Count()
                }).OrderByDescending(g => g.Count).Take(10));
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