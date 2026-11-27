using System;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using NervboxDeamon.Controllers.Base;
using NervboxDeamon.Models.Settings;
using NervboxDeamon.Services;

namespace NervboxDeamon.Controllers
{
  /// <summary>
  /// Text-to-speech via the local Piper service (pi-setup/tts). Admin-only test feature for now.
  /// </summary>
  [Authorize(Roles = "admin")]
  [ApiController]
  [Route("api/[controller]")]
  public class TtsController : NervboxBaseController<TtsController>
  {
    private const int MaxChars = 500;
    private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(90) };
    private static readonly string TempDir = Path.Combine(Path.GetTempPath(), "nervbox-tts");

    private readonly AppSettings _settings;
    private readonly ISoundService _soundService;

    public TtsController(IOptions<AppSettings> settings, ISoundService soundService)
    {
      _settings = settings.Value;
      _soundService = soundService;
    }

    public class TtsRequest
    {
      public string Text { get; set; }
      public string Voice { get; set; }
      public string Speaker { get; set; }
      public double? LengthScale { get; set; }
    }

    /// <summary>GET /api/tts/voices - voices offered by the TTS service</summary>
    [HttpGet("voices")]
    public async Task<IActionResult> GetVoices()
    {
      if (string.IsNullOrWhiteSpace(_settings.TtsUrl)) return StatusCode(503, new { Error = "TTS ist nicht konfiguriert" });
      try
      {
        var json = await Http.GetStringAsync($"{_settings.TtsUrl.TrimEnd('/')}/voices");
        return Content(json, "application/json");
      }
      catch (Exception ex)
      {
        Logger.LogWarning("TTS service unreachable: {Message}", ex.Message);
        return StatusCode(503, new { Error = "TTS-Dienst nicht erreichbar" });
      }
    }

    /// <summary>POST /api/tts - synthesize text and play it on the Nervbox (Local mode)</summary>
    [HttpPost]
    public async Task<IActionResult> Speak([FromBody] TtsRequest request)
    {
      var text = request?.Text?.Trim();
      if (string.IsNullOrEmpty(text)) return BadRequest(new { Error = "Text fehlt" });
      if (text.Length > MaxChars) return BadRequest(new { Error = $"Maximal {MaxChars} Zeichen" });
      if (string.IsNullOrWhiteSpace(_settings.TtsUrl)) return StatusCode(503, new { Error = "TTS ist nicht konfiguriert" });

      var started = DateTime.UtcNow;
      byte[] wav;
      try
      {
        // StringContent (not PostAsJsonAsync): the Python service needs a Content-Length, no chunked body
        var payload = System.Text.Json.JsonSerializer.Serialize(new
        {
          text,
          voice = request.Voice,
          speaker = request.Speaker,
          lengthScale = request.LengthScale ?? 1.0
        });
        using var response = await Http.PostAsync($"{_settings.TtsUrl.TrimEnd('/')}/synth",
          new StringContent(payload, System.Text.Encoding.UTF8, "application/json"));
        if (!response.IsSuccessStatusCode)
        {
          var err = await response.Content.ReadAsStringAsync();
          return StatusCode(502, new { Error = $"TTS-Fehler: {err}" });
        }
        wav = await response.Content.ReadAsByteArrayAsync();
      }
      catch (Exception ex)
      {
        Logger.LogWarning("TTS synth failed: {Message}", ex.Message);
        return StatusCode(503, new { Error = "TTS-Dienst nicht erreichbar" });
      }
      var synthMs = (int)(DateTime.UtcNow - started).TotalMilliseconds;

      Directory.CreateDirectory(TempDir);
      CleanupOldFiles();
      var id = Guid.NewGuid().ToString("N");
      var path = Path.Combine(TempDir, id + ".wav");
      await System.IO.File.WriteAllBytesAsync(path, wav);

      var playedOnBox = _soundService.PlayFile(path);
      Logger.LogInformation("TTS by {User}: {Chars} chars, voice {Voice}/{Speaker}, synth {Ms} ms, box={Box}",
        UserName, text.Length, request.Voice, request.Speaker, synthMs, playedOnBox);

      return Ok(new
      {
        Id = id,
        Url = $"/tts/{id}/file",
        SynthMs = synthMs,
        DurationMs = WavDurationMs(wav),
        PlayedOnBox = playedOnBox
      });
    }

    /// <summary>GET /api/tts/{id}/file - the rendered WAV (browser playback / download)</summary>
    // Anonymous: <audio> cannot send the JWT header; the id is a random GUID that expires after 1 h.
    [AllowAnonymous]
    [HttpGet("{id}/file")]
    public IActionResult GetFile(string id)
    {
      if (id.Length != 32 || !id.All(Uri.IsHexDigit)) return BadRequest();
      var path = Path.Combine(TempDir, id + ".wav");
      if (!System.IO.File.Exists(path)) return NotFound();
      return PhysicalFile(path, "audio/wav", enableRangeProcessing: true);
    }

    private static void CleanupOldFiles()
    {
      foreach (var f in Directory.GetFiles(TempDir, "*.wav"))
      {
        try
        {
          if (System.IO.File.GetCreationTimeUtc(f) < DateTime.UtcNow.AddHours(-1)) System.IO.File.Delete(f);
        }
        catch
        {
          // file still playing or already gone
        }
      }
    }

    private static int WavDurationMs(byte[] wav)
    {
      // PCM WAV: byte rate at offset 28, data size = total - 44 header bytes
      if (wav.Length < 44) return 0;
      var byteRate = BitConverter.ToInt32(wav, 28);
      return byteRate > 0 ? (int)((wav.Length - 44) * 1000L / byteRate) : 0;
    }
  }
}
