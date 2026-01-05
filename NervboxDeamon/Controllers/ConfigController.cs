using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using NervboxDeamon.Models.Settings;

namespace NervboxDeamon.Controllers
{
  /// <summary>
  /// Public configuration endpoint for client applications
  /// Returns non-sensitive configuration that clients need to know
  /// </summary>
  [Route("api/[controller]")]
  [ApiController]
  public class ConfigController : ControllerBase
  {
    private readonly AppSettings _appSettings;

    public ConfigController(IOptions<AppSettings> appSettings)
    {
      _appSettings = appSettings.Value;
    }

    /// <summary>
    /// GET /api/config - Returns public configuration
    /// </summary>
    [HttpGet]
    public IActionResult GetConfig()
    {
      return Ok(new
      {
        // PlaybackMode: "Local" = server plays sound, "Browser" = client streams
        PlaybackMode = _appSettings.PlaybackMode.ToString(),

        // Version info (can be extended)
        Version = "2.0.0"
      });
    }
  }
}
