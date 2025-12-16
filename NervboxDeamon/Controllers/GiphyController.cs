using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using NervboxDeamon.Controllers.Base;
using NervboxDeamon.Services;

namespace NervboxDeamon.Controllers
{
  [Route("api/[controller]")]
  [ApiController]
  [Authorize]
  public class GiphyController : NervboxBaseController<GiphyController>
  {
    private readonly IGiphyService _giphyService;

    public GiphyController(IGiphyService giphyService)
    {
      _giphyService = giphyService;
    }

    /// <summary>
    /// GET /api/giphy/search?q=funny&limit=25&offset=0
    /// </summary>
    [HttpGet("search")]
    public async Task<IActionResult> Search([FromQuery] string q, [FromQuery] int limit = 25, [FromQuery] int offset = 0)
    {
      try
      {
        if (!_giphyService.IsConfigured)
        {
          return StatusCode(503, new { Error = "Giphy API not configured" });
        }

        if (string.IsNullOrWhiteSpace(q))
        {
          return BadRequest(new { Error = "Query parameter 'q' is required" });
        }

        limit = Math.Clamp(limit, 1, 50);
        offset = Math.Max(0, offset);

        var result = await _giphyService.SearchAsync(q, limit, offset);
        return Content(result, "application/json");
      }
      catch (Exception ex)
      {
        Logger.LogError(ex, "Giphy search failed for query: {Query}", q);
        return StatusCode(500, new { Error = "Giphy search failed" });
      }
    }

    /// <summary>
    /// GET /api/giphy/trending?limit=25&offset=0
    /// </summary>
    [HttpGet("trending")]
    public async Task<IActionResult> Trending([FromQuery] int limit = 25, [FromQuery] int offset = 0)
    {
      try
      {
        if (!_giphyService.IsConfigured)
        {
          return StatusCode(503, new { Error = "Giphy API not configured" });
        }

        limit = Math.Clamp(limit, 1, 50);
        offset = Math.Max(0, offset);

        var result = await _giphyService.TrendingAsync(limit, offset);
        return Content(result, "application/json");
      }
      catch (Exception ex)
      {
        Logger.LogError(ex, "Giphy trending failed");
        return StatusCode(500, new { Error = "Giphy trending failed" });
      }
    }

    /// <summary>
    /// GET /api/giphy/status - Check if Giphy is configured
    /// </summary>
    [HttpGet("status")]
    [AllowAnonymous]
    public IActionResult Status()
    {
      return Ok(new { Configured = _giphyService.IsConfigured });
    }
  }
}
