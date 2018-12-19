using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using NervboxDeamon.Controllers.Base;
using NervboxDeamon.DbModels;

namespace NervboxDeamon.Controllers
{
  [AllowAnonymous]
  [Authorize]
  [Route("api/[controller]")]
  [ApiController]
  public class SettingsController : NervboxBaseController<SettingsController>
  {
    [HttpGet]
    public IActionResult GetSetting([FromQuery(Name = "scope")] SettingScope? scope, [FromQuery(Name = "key")] String settingKey)
    {
      if (!string.IsNullOrEmpty(settingKey))
      {
        return Ok(this.DbContext.Settings.Where(s => s.Key.ToLowerInvariant().Equals(settingKey.ToLowerInvariant())).FirstOrDefault());
      }
      else if (scope.HasValue)
      {
        return Ok(this.DbContext.Settings.Where(s => s.SettingScope == scope).OrderBy(s => s.Key).ToList());
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
      var setting = await this.DbContext.Settings.FindAsync(settingKey);

      switch (setting.SettingType)
      {
        case SettingType.Boolean:
          bool boolVal = false;
          if (!Boolean.TryParse(s.Value, out boolVal))
          {
            return BadRequest(new { Error = string.Format("The value of this setting must be of type '{0}'", setting.SettingType.ToString()) });
          }
          break;
        case SettingType.String:
          break;
        case SettingType.Int:
          int intVal = -1;
          if (!int.TryParse(s.Value, out intVal))
          {
            return BadRequest(new { Error = string.Format("The value of this setting must be of type '{0}'", setting.SettingType.ToString()) });
          }
          break;
        case SettingType.Double:
          double doubleVal = 0.0d;
          try
          {
            doubleVal = Convert.ToDouble(s.Value, CultureInfo.InvariantCulture);
          }
          catch (Exception)
          {
            return BadRequest(new { Error = string.Format("The value of this setting must be of type '{0}'", setting.SettingType.ToString()) });
          }
          break;
        case SettingType.JSON:
          object jsonVal = null;
          try
          {
            jsonVal = JsonConvert.DeserializeObject(s.Value);
          }
          catch (Exception)
          {
            return BadRequest(new { Error = string.Format("The value of this setting must be of type '{0}'", setting.SettingType.ToString()) });
          }
          break;

        default:
          throw new NotImplementedException(string.Format("The setting type '{0}' is not implemented or not supported.", setting.SettingType));
      }

      setting.Value = s.Value;

      await DbContext.SaveChangesAsync();

      //if (setting.SettingType == SettingType.JSON)
      //{
      //  var jobject = setting.ValueJSON;
      //  var affe = jobject;
      //}

      return Ok(setting);
    }

  }
}