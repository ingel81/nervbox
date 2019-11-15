using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;
using NervboxDeamon.Controllers.Base;
using NervboxDeamon.DbModels;
using NervboxDeamon.Services;
using NervboxDeamon.Services.Interfaces;

namespace NervboxDeamon.Controllers
{
  /// <summary>
  /// Controller für die Verwaltung von Settings
  /// </summary>
  [Authorize]
  [Route("api/[controller]")]
  [ApiController]
  public class SettingsController : NervboxBaseController<SettingsController>
  {

    //injected
    private ISettingsService SettingService { get; }

    public SettingsController(ISettingsService settingService)
    {
      this.SettingService = settingService;
    }

    [HttpGet]
    public IActionResult GetSetting([FromQuery(Name = "scope")] SettingScope? scope, [FromQuery(Name = "key")] String settingKey)
    {
      if (!string.IsNullOrEmpty(settingKey))
      {
        return Ok(this.SettingService.GetSingleSettingByKey(settingKey));
      }
      else if (scope.HasValue)
      {
        return Ok(this.SettingService.GetSettingsByScope(scope.Value));
      }
      else
      {
        return BadRequest();
      }
    }

    [HttpPut]
    [Route("{settingKey}")]
    public async Task<IActionResult> UpdateSetting(string settingKey, Setting s)
    {
      if (!s.Key.Equals(settingKey))
      {
        return BadRequest("");
      }

      return Ok(await this.SettingService.UpdateSingleSetting(s));
    }

    [HttpPut]
    public async Task<IActionResult> UpdateSettings(IEnumerable<Setting> updateSettings)
    {
      var result = await this.SettingService.UpdateMultipleSettings(updateSettings.ToList());
      return Ok(result);
    }

  }
}