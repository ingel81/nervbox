using System;
using System.Collections.Concurrent;
using System.Linq;
using System.Threading;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using NervboxDeamon.Hubs;
using NervboxDeamon.Services.Audio;

namespace NervboxDeamon.Services
{
  /// <summary>A started sound ("voice"), in every playback mode.</summary>
  public class VoiceInfo
  {
    public int Id { get; set; }
    public int UserId { get; set; }
    public string SoundHash { get; set; }
    public SoundEffect Effect { get; set; }
    public DateTime StartedAt { get; set; }
    public int ExpectedMs { get; set; }
    /// <summary>Mixer voice on the box (Local + LocalPlayer=mixer)</summary>
    public bool OnMixer { get; set; }
    /// <summary>Played by the initiator's browser (PlaybackMode=Browser)</summary>
    public bool InBrowser { get; set; }
    public bool Controllable => OnMixer || InBrowser;
  }

  public interface IVoiceService
  {
    int NextId();
    void Register(VoiceInfo info);
    VoiceInfo Get(int id);
    /// <summary>Stop one voice. Only the initiator or an admin. Returns null on success, else the error.</summary>
    string Stop(int id, int userId, bool isAdmin);
    /// <summary>Live control of a mixer voice (initiator only); browser voices are modulated in the browser.</summary>
    bool Modulate(int id, int userId, double rate, double filter, double wobble);
    /// <summary>Browser mode: the initiator's browser reports the natural end of its voice.</summary>
    bool ReportEnded(int id, int userId);
    /// <summary>"Alle stoppen": end every tracked voice (mixer voices end through the mixer event).</summary>
    void EndAll();
    /// <summary>Mark a voice as ended and broadcast it (e.g. the mixer could not start it).</summary>
    void End(int id, string reason);
  }

  /// <summary>
  /// Voice ids, ownership and the SignalR side of the mixer: "soundEnded" {voiceId, reason} and
  /// "mixLevel" {peak, rms, limiterDb, voices:[{id, peak}]} (only while something plays).
  /// </summary>
  public class VoiceService : IVoiceService
  {
    private readonly ConcurrentDictionary<int, VoiceInfo> _voices = new();
    private readonly IMixerService _mixer;
    private readonly IHubContext<SoundHub> _hub;
    private readonly ILogger<VoiceService> _logger;
    // ids stay unique across restarts (clients dedupe events by id)
    private int _nextId = (int)(DateTimeOffset.UtcNow.ToUnixTimeSeconds() % 1_000_000) * 1000;

    public VoiceService(IMixerService mixer, IHubContext<SoundHub> hub, ILogger<VoiceService> logger)
    {
      _mixer = mixer;
      _hub = hub;
      _logger = logger;
      _mixer.VoiceEnded += OnMixerVoiceEnded;
      _mixer.Levels += OnLevels;
    }

    public int NextId() => Interlocked.Increment(ref _nextId);

    public void Register(VoiceInfo info)
    {
      _voices[info.Id] = info;
      // forget voices that never reported an end (browser closed, non-mixer players)
      var now = DateTime.UtcNow;
      foreach (var kv in _voices)
      {
        var v = kv.Value;
        if ((now - v.StartedAt).TotalMilliseconds > v.ExpectedMs * 3 + 60_000 && !_mixer.IsPlaying(v.Id))
          _voices.TryRemove(kv.Key, out _);
      }
    }

    public VoiceInfo Get(int id) => _voices.TryGetValue(id, out var v) ? v : null;

    public string Stop(int id, int userId, bool isAdmin)
    {
      if (!_voices.TryGetValue(id, out var v)) return "Sound läuft nicht mehr";
      if (v.UserId != userId && !isAdmin) return "Nur wer den Sound gestartet hat (oder ein Admin) darf ihn stoppen";
      if (v.OnMixer)
      {
        // the mixer fades out and raises VoiceEnded -> broadcast
        if (_mixer.StopVoice(id)) return null;
        End(id, "stopped");
        return null;
      }
      if (v.InBrowser)
      {
        End(id, "stopped"); // the initiator's browser stops on this event
        return null;
      }
      return "Dieser Sound kann nicht einzeln gestoppt werden";
    }

    public bool Modulate(int id, int userId, double rate, double filter, double wobble)
    {
      if (!_voices.TryGetValue(id, out var v) || v.UserId != userId || !v.OnMixer) return false;
      return _mixer.SetLive(id, rate, filter, wobble);
    }

    public bool ReportEnded(int id, int userId)
    {
      if (!_voices.TryGetValue(id, out var v) || v.UserId != userId || !v.InBrowser) return false;
      End(id, "end");
      return true;
    }

    public void EndAll()
    {
      foreach (var v in _voices.Values.Where(v => !v.OnMixer).ToList()) End(v.Id, "stopped");
    }

    private void OnMixerVoiceEnded(int id, string reason)
    {
      if (id > 0) End(id, reason);
    }

    public void End(int id, string reason)
    {
      if (!_voices.TryRemove(id, out _)) return;
      _ = _hub.Clients.All.SendAsync("soundEnded", new { VoiceId = id, Reason = reason });
    }

    private void OnLevels(MixerLevels lv)
    {
      // anonymous voices (TTS, negative ids) only count for the master meter
      lv.Voices.RemoveAll(x => x.Id <= 0);
      _ = _hub.Clients.All.SendAsync("mixLevel", lv);
    }
  }
}
