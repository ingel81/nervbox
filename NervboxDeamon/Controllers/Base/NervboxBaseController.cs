﻿using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace NervboxDeamon.Controllers.Base
{
  public abstract class NervboxBaseController<T> : Controller where T : NervboxBaseController<T>
  {
    private ILogger<T> _logger;
    protected ILogger Logger => _logger ?? (_logger = HttpContext?.RequestServices.GetService<ILogger<T>>());

    private NervboxDBContext _dbContext;
    protected NervboxDBContext DbContext => _dbContext ?? (_dbContext = HttpContext.RequestServices.GetService<NervboxDBContext>());

    protected string UserName
    {
      get => this.User.Claims.Where(a => a.Type.Equals("userName")).First().Value;
    }

    protected int UserId
    {
      get => int.Parse(this.User.Claims.Where(a => a.Type.Equals(ClaimTypes.Name)).First().Value);
    }
  }
}