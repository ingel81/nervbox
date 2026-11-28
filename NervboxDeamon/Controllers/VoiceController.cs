using System;
using System.Collections.Concurrent;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using NervboxDeamon.Controllers.Base;
using NervboxDeamon.Models.Settings;
using NervboxDeamon.Services;
using NervboxDeamon.Services.Audio;

namespace NervboxDeamon.Controllers
{
  /// <summary>Single running sounds ("voices"): stop, plus DSP/mixer self tests for admins.</summary>
  [Route("api/[controller]")]
  [ApiController]
  public class VoiceController : NervboxBaseController<VoiceController>
  {
    private readonly IVoiceService _voices;
    private readonly AppSettings _settings;
    private readonly ILoggerFactory _loggerFactory;

    public VoiceController(IVoiceService voices, IOptions<AppSettings> settings, ILoggerFactory loggerFactory)
    {
      _voices = voices;
      _settings = settings.Value;
      _loggerFactory = loggerFactory;
    }

    private bool IsAdmin => User.IsInRole("admin") || User.HasClaim("role", "admin");

    /// <summary>POST /api/voice/{id}/stop - stop one running sound (initiator or admin)</summary>
    [Authorize]
    [HttpPost("{id:int}/stop")]
    public IActionResult Stop(int id)
    {
      var v = _voices.Get(id);
      if (v == null) return NotFound(new { Error = "Sound läuft nicht mehr" });
      var error = _voices.Stop(id, UserId, IsAdmin);
      if (error == null) return Ok(new { VoiceId = id });
      return v.UserId != UserId && !IsAdmin ? StatusCode(403, new { Error = error }) : Conflict(new { Error = error });
    }

    /// <summary>GET /api/voice/selftest - numeric DSP checks + CPU estimate (no audio device used)</summary>
    [Authorize(Roles = "admin")]
    [HttpGet("selftest")]
    public IActionResult SelfTest() => Ok(DspSelfTest.Run());

    /// <summary>
    /// POST /api/voice/mixertest - runs a separate mixer instance on the internal null sink (inaudible,
    /// safe on the box): WAV voice (TTS path) with echo + live control, PCM pitch-up voice stopped early,
    /// reverse voice, an MP3 from the sound folder (mpg123; on Windows it fails gracefully). On Windows
    /// it also checks that a missing aplay makes Play() return false instead of throwing.
    /// </summary>
    [Authorize(Roles = "admin")]
    [HttpPost("mixertest")]
    public async Task<IActionResult> MixerTest()
    {
      var mixer = new MixerService(_loggerFactory.CreateLogger<MixerService>());
      mixer.Configure("none", 60);
      var ended = new ConcurrentDictionary<int, string>();
      var endedAt = new ConcurrentDictionary<int, double>();
      int levelFrames = 0;
      double maxPeak = 0, maxLimiterDb = 0;
      var seenVoiceIds = new ConcurrentDictionary<int, bool>();
      var sw = System.Diagnostics.Stopwatch.StartNew();
      mixer.VoiceEnded += (id, reason) => { ended[id] = reason; endedAt[id] = sw.Elapsed.TotalSeconds; };
      mixer.Levels += lv =>
      {
        System.Threading.Interlocked.Increment(ref levelFrames);
        maxPeak = Math.Max(maxPeak, lv.Peak);
        maxLimiterDb = Math.Max(maxLimiterDb, lv.LimiterDb);
        foreach (var v in lv.Voices) seenVoiceIds[v.Id] = true;
      };

      // TTS-like WAV: 2 s, 22.05 kHz mono
      var dir = Path.Combine(Path.GetTempPath(), "nervbox-tts");
      Directory.CreateDirectory(dir);
      var wavPath = Path.Combine(dir, "mixertest-" + Guid.NewGuid().ToString("N") + ".wav");
      var mono = new short[22050 * 2];
      for (int i = 0; i < mono.Length; i++) mono[i] = (short)(12000 * Math.Sin(2 * Math.PI * 330 * i / 22050.0));
      await System.IO.File.WriteAllBytesAsync(wavPath, WavReader.Encode16(mono, 1, 22050));

      var stereo = new short[48000 * 2 * 3];
      for (int i = 0; i < stereo.Length / 2; i++) stereo[2 * i] = stereo[2 * i + 1] = (short)(20000 * Math.Sin(2 * Math.PI * 220 * i / 48000.0));

      var mp3 = Directory.Exists(_settings.SoundPath)
        ? new DirectoryInfo(_settings.SoundPath).GetFiles("*.mp3").OrderBy(f => f.Length).FirstOrDefault()
        : null;

      bool p1 = mixer.Play(new MixerPlayRequest { VoiceId = 1, FilePath = wavPath, Gain = 0.8, Effect = SoundEffect.Echo });
      bool p2 = mixer.Play(new MixerPlayRequest { VoiceId = 2, Pcm = stereo, Gain = 0.8, Effect = SoundEffect.PitchUp });
      bool p3 = mixer.Play(new MixerPlayRequest { VoiceId = 3, Pcm = stereo[..(48000 * 2)], Gain = 0.8, Effect = SoundEffect.Reverse });
      bool p4 = mp3 != null && mixer.Play(new MixerPlayRequest { VoiceId = 4, FilePath = mp3.FullName, Gain = 0.5, Effect = SoundEffect.Reverb });
      bool dup = mixer.Play(new MixerPlayRequest { VoiceId = 2, Pcm = stereo });

      await Task.Delay(300);
      bool live = mixer.SetLive(1, 1.8, -0.6, 0.9);
      await Task.Delay(400);
      bool stop = mixer.StopVoice(2);
      bool liveUnknown = mixer.SetLive(999, 1, 0, 0);

      for (int i = 0; i < 120 && !(ended.ContainsKey(1) && ended.ContainsKey(2) && ended.ContainsKey(3) && (!p4 || ended.ContainsKey(4))); i++)
        await Task.Delay(100);
      var stats = mixer.GetStats();
      mixer.Shutdown();
      try { System.IO.File.Delete(wavPath); } catch { /* ignore */ }

      object noAlsa = null;
      if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
      {
        // no aplay on Windows: must fail gracefully (false), never throw
        var m2 = new MixerService(_loggerFactory.CreateLogger<MixerService>());
        m2.Configure("default", 60);
        bool started;
        string error = null;
        try { started = m2.Play(new MixerPlayRequest { VoiceId = 1, Pcm = stereo }); }
        catch (Exception ex) { started = false; error = ex.GetType().Name + ": " + ex.Message; }
        m2.Shutdown();
        noAlsa = new { PlayReturned = started, Exception = error, Graceful = !started && error == null };
      }

      return Ok(new
      {
        Played = new { WavEcho = p1, PcmPitchUp = p2, Reverse = p3, Mp3Reverb = p4, Mp3File = mp3?.Name, DuplicateIdRejected = !dup },
        LiveControlAccepted = live,
        LiveUnknownVoiceRejected = !liveUnknown,
        StopAccepted = stop,
        Ended = ended.OrderBy(kv => kv.Key).Select(kv => new { Voice = kv.Key, Reason = kv.Value, AtSec = Math.Round(endedAt[kv.Key], 2) }),
        LevelFrames = levelFrames,
        LevelFramesPerSec = Math.Round(levelFrames / Math.Max(0.1, sw.Elapsed.TotalSeconds), 1),
        MaxPeak = maxPeak,
        MaxLimiterDb = maxLimiterDb,
        VoicesInLevels = seenVoiceIds.Keys.OrderBy(x => x),
        Stats = stats,
        NoAlsa = noAlsa
      });
    }
  }
}
