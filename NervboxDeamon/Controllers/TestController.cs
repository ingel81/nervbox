using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace NervboxDeamon.Controllers
{
  [AllowAnonymous]
  [Route("api/[controller]")]
  [ApiController]
  public class TestController : ControllerBase
  {
    [AllowAnonymous]
    [HttpGet]
    [Route("shutdown")]
    public void Shutdown()
    {
      Environment.Exit(0);      
    }
  }
}