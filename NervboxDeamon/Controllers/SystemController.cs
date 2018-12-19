using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using NervboxDeamon.Controllers.Base;
using NervboxDeamon.Services;

namespace NervboxDeamon.Controllers
{
  [Authorize]
  [Route("api/[controller]")]
  [ApiController]
  public class SystemController : NervboxBaseController<SystemController>
  {
    //injected
    private ISystemService SystemService { get; }
    private IHostingEnvironment Environment { get; }

    public SystemController(ISystemService systemService, IHostingEnvironment environment)
    {
      this.SystemService = systemService;
      this.Environment = environment;
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

  }
}
