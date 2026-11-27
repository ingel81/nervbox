using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NervboxDeamon.Controllers.Base;
using NervboxDeamon.Services;

namespace NervboxDeamon.Controllers
{
  /// <summary>
  /// Playback loudness normalization (files untouched). The Pi applies the gains via mpg123 -f,
  /// browsers via audio.volume, so both play the same.
  /// </summary>
  [Route("api/[controller]")]
  [ApiController]
  public class LoudnessController : NervboxBaseController<LoudnessController>
  {
    private readonly ILoudnessService _loudness;

    public LoudnessController(ILoudnessService loudness)
    {
      _loudness = loudness;
    }

    public class LoudnessSettingsRequest
    {
      public bool Enabled { get; set; }
      public double? TargetDb { get; set; }
    }

    /// <summary>GET /api/loudness - linear gains (&lt; 1) per sound hash; missing hash = 1</summary>
    [HttpGet]
    public IActionResult GetGains() => Ok(new { _loudness.Enabled, Gains = _loudness.GetGains() });

    /// <summary>GET /api/loudness/status - measurement progress and settings</summary>
    [Authorize(Roles = "admin")]
    [HttpGet("status")]
    public IActionResult GetStatus() => Ok(_loudness.GetStatus());

    /// <summary>PUT /api/loudness - switch normalization on/off, set the target loudness</summary>
    [Authorize(Roles = "admin")]
    [HttpPut]
    public IActionResult Configure([FromBody] LoudnessSettingsRequest request)
    {
      _loudness.Configure(request.Enabled, request.TargetDb ?? _loudness.TargetDb);
      return Ok(_loudness.GetStatus());
    }
  }
}
