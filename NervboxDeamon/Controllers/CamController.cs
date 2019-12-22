using System;
using System.Collections.Generic;
using System.IO;
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
  public class CamController : NervboxBaseController<CamController>
  {
    //injected
    private IWebHostEnvironment Environment { get; }
    private ICamService CamService { get; }
    private IHttpContextAccessor Accessor { get; }

    public CamController(ICamService camService, IWebHostEnvironment environment, IHttpContextAccessor accessor)
    {
      this.CamService = camService;
      this.Environment = environment;
      this.Accessor = accessor;
    }

    [HttpGet]
    public IActionResult GetCurrentImage()
    {
      return File(ImageToByteArray(this.CamService.GetCurrentImage()), "image/jpeg");
    }


    [HttpGet]
    [Route("move/{direction}")]
    public IActionResult MoveCam(string direction)
    {
      var ip = Accessor.HttpContext.Connection.RemoteIpAddress.ToString();

      try
      {
        this.CamService.Move(direction, this.UserId);

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


    private byte[] ImageToByteArray(System.Drawing.Image imageIn)
    {
      MemoryStream ms = new MemoryStream();
      imageIn.Save(ms, System.Drawing.Imaging.ImageFormat.Jpeg);
      return ms.ToArray();
    }

  }
}