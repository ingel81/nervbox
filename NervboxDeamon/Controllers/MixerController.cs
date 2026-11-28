using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using NervboxDeamon.Models.Settings;
using Microsoft.AspNetCore.Mvc;
using NervboxDeamon.Controllers.Base;
using NervboxDeamon.Services;

namespace NervboxDeamon.Controllers
{
  /// <summary>Diagnostics of the software mixer (LocalPlayer = "mixer").</summary>
  [Authorize(Roles = "admin")]
  [Route("api/[controller]")]
  [ApiController]
  public class MixerController : NervboxBaseController<MixerController>
  {
    private readonly IMixerService _mixer;
    private readonly AppSettings _settings;
    private readonly ILoggerFactory _loggerFactory;

    public MixerController(IMixerService mixer, IOptions<AppSettings> settings, ILoggerFactory loggerFactory)
    {
      _mixer = mixer;
      _settings = settings.Value;
      _loggerFactory = loggerFactory;
    }

    /// <summary>
    /// POST /api/mixer/bench?voices=16&amp;seconds=10&amp;device=null - load test with a separate mixer
    /// instance (default ALSA "null" device = inaudible): plays N random sounds at once and reports
    /// process CPU, underruns and mix time. effect = pitch-up|…|telephone, or "mixed" (all effects in
    /// rotation + live control) to measure the per-voice DSP cost.
    /// </summary>
    [HttpPost("bench")]
    public async Task<IActionResult> Bench([FromQuery] int voices = 16, [FromQuery] int seconds = 10, [FromQuery] string device = "null", [FromQuery] string effect = null)
    {
      voices = Math.Clamp(voices, 1, 32);
      seconds = Math.Clamp(seconds, 2, 30);
      var files = new DirectoryInfo(_settings.SoundPath).GetFiles("*.mp3")
        .Where(f => f.Length > 200_000).OrderBy(_ => Guid.NewGuid()).Take(voices).ToList();

      var mixer = new MixerService(_loggerFactory.CreateLogger<MixerService>());
      mixer.Configure(device, _settings.MixerBufferMs);
      var proc = Process.GetCurrentProcess();
      var cpu0 = proc.TotalProcessorTime;
      var sys0 = ReadProcStat();
      var sw = Stopwatch.StartNew();
      var rotation = new[] { "reverb", "echo", "telephone", "pitch-up", "pitch-down", "reverse", null };
      int n = 0;
      foreach (var f in files)
      {
        var fx = effect == "mixed" ? rotation[n % rotation.Length] : effect;
        int id = 1_000_000 + n++;
        mixer.Play(new MixerPlayRequest { VoiceId = id, FilePath = f.FullName, Gain = 0.8, Effect = Services.Audio.FxParams.Parse(fx) });
        if (effect == "mixed") mixer.SetLive(id, 1.2, n % 2 == 0 ? -0.4 : 0.4, 0.5);
      }
      await Task.Delay(TimeSpan.FromSeconds(seconds));
      var stats = mixer.GetStats();
      proc.Refresh();
      var sys1 = ReadProcStat();
      double sysPct = sys1.total > sys0.total ? Math.Round(100.0 * (1 - (double)(sys1.idle - sys0.idle) / (sys1.total - sys0.total)), 1) : -1;
      var cpu = (proc.TotalProcessorTime - cpu0).TotalMilliseconds / sw.Elapsed.TotalMilliseconds * 100;
      mixer.Shutdown();
      return Ok(new
      {
        Files = files.Count,
        Device = device,
        Effect = effect,
        Seconds = seconds,
        BackendCpuPercentOfOneCore = Math.Round(cpu, 1),
        SystemCpuPercentAllCores = sysPct,
        stats.PeakVoices,
        stats.ActiveVoices,
        stats.Underruns,
        stats.Clipped,
        stats.AvgMixUs
      });
    }

    private static (long idle, long total) ReadProcStat()
    {
      try
      {
        var parts = System.IO.File.ReadLines("/proc/stat").First().Split(' ', StringSplitOptions.RemoveEmptyEntries).Skip(1).Select(long.Parse).ToArray();
        return (parts[3] + parts[4], parts.Sum());
      }
      catch
      {
        return (0, 0);
      }
    }

    /// <summary>GET /api/mixer/stats - voices, underruns, clipping, mix time per 10 ms period</summary>
    [HttpGet("stats")]
    public IActionResult Stats() => Ok(_mixer.GetStats());
  }
}
