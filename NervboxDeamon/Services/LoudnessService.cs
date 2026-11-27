using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

namespace NervboxDeamon.Services
{
  /// <summary>
  /// Playback loudness normalization without touching the sound files: each file's gated RMS
  /// loudness is measured once (mpg123 decode) and cached in loudness.json next to the sounds.
  /// Normalization only ATTENUATES (gain &lt;= 0 dB) so the browser can mirror it with
  /// audio.volume (max 1.0) and the Pi with mpg123 -f.
  /// </summary>
  public interface ILoudnessService
  {
    bool Enabled { get; }
    double TargetDb { get; }
    /// <summary>Start measuring missing sounds in the background (Local mode with mpg123 only).</summary>
    void Start(string soundDirectory, IEnumerable<(string Hash, string FileName)> sounds);
    /// <summary>Measure one newly added sound in the background.</summary>
    void Add(string hash, string fileName);
    /// <summary>Linear gain (0..1] for a sound; 1 when disabled or unknown.</summary>
    double GetGain(string hash);
    /// <summary>All gains below 1 (others are implicitly 1).</summary>
    Dictionary<string, double> GetGains();
    void Configure(bool enabled, double targetDb);
    void Stop();
    LoudnessStatus GetStatus();
  }

  public class LoudnessStatus
  {
    public bool Enabled { get; set; }
    public double TargetDb { get; set; }
    public double MaxCutDb { get; set; }
    public int Measured { get; set; }
    public int Total { get; set; }
    public int Attenuated { get; set; }
    public bool Measuring { get; set; }
  }

  public class LoudnessService : ILoudnessService
  {
    public const double DefaultTargetDb = -16.0;
    private const double MaxCutDb = 12.0;
    private const int SampleRate = 16000;
    private const int Window = 800; // 50 ms
    private const double GateDb = -50.0;

    private class Entry
    {
      public double LoudnessDb { get; set; }
      public double PeakDb { get; set; }
    }

    private class Store
    {
      public bool Enabled { get; set; } = true;
      public double TargetDb { get; set; } = DefaultTargetDb;
      public Dictionary<string, Entry> Sounds { get; set; } = new();
    }

    private readonly ILogger<LoudnessService> _logger;
    private readonly object _fileLock = new();
    private readonly ConcurrentDictionary<string, Entry> _entries = new();
    private string _storePath;
    private volatile bool _enabled = true;
    private double _targetDb = DefaultTargetDb;
    private volatile bool _stop;
    private volatile bool _measuring;
    private int _total;
    private Thread _worker;
    private string _soundDirectory;
    private bool _canMeasure;

    public LoudnessService(ILogger<LoudnessService> logger)
    {
      _logger = logger;
    }

    public bool Enabled => _enabled;
    public double TargetDb => _targetDb;

    public void Start(string soundDirectory, IEnumerable<(string Hash, string FileName)> sounds)
    {
      _soundDirectory = soundDirectory;
      _canMeasure = HasMpg123();
      var dir = new DirectoryInfo(soundDirectory);
      _storePath = Path.Combine(dir.Parent?.FullName ?? dir.FullName, "loudness.json");
      Load();

      var list = sounds.ToList();
      _total = list.Count;
      var missing = list.Where(s => !_entries.ContainsKey(s.Hash)).ToList();
      if (missing.Count == 0) return;
      if (!_canMeasure)
      {
        _logger.LogInformation("Loudness: mpg123 not available, {Count} sounds stay unmeasured", missing.Count);
        return;
      }

      _worker = new Thread(() => Measure(soundDirectory, missing))
      {
        IsBackground = true,
        Name = "LoudnessScan",
        Priority = ThreadPriority.BelowNormal
      };
      _worker.Start();
    }

    public void Stop() => _stop = true;

    public void Add(string hash, string fileName)
    {
      if (!_canMeasure || hash == null || _entries.ContainsKey(hash)) return;
      _total++;
      System.Threading.Tasks.Task.Run(() => Measure(_soundDirectory, new List<(string, string)> { (hash, fileName) }));
    }

    public double GetGain(string hash)
    {
      if (!_enabled || hash == null || !_entries.TryGetValue(hash, out var e)) return 1.0;
      var cut = Math.Min(0, Math.Max(-MaxCutDb, _targetDb - e.LoudnessDb));
      return Math.Round(Math.Pow(10, cut / 20.0), 3);
    }

    public Dictionary<string, double> GetGains()
    {
      var result = new Dictionary<string, double>();
      if (!_enabled) return result;
      foreach (var hash in _entries.Keys)
      {
        var g = GetGain(hash);
        if (g < 1.0) result[hash] = g;
      }
      return result;
    }

    public void Configure(bool enabled, double targetDb)
    {
      _enabled = enabled;
      _targetDb = Math.Clamp(targetDb, -30, -6);
      Save();
      _logger.LogInformation("Loudness normalization {State}, target {Target} dB", enabled ? "on" : "off", _targetDb);
    }

    public LoudnessStatus GetStatus() => new LoudnessStatus
    {
      Enabled = _enabled,
      TargetDb = _targetDb,
      MaxCutDb = MaxCutDb,
      Measured = _entries.Count,
      Total = _total,
      Attenuated = _entries.Keys.Count(h => GetGain(h) < 1.0),
      Measuring = _measuring
    };

    private void Measure(string soundDirectory, List<(string Hash, string FileName)> missing)
    {
      _measuring = true;
      var sw = Stopwatch.StartNew();
      int done = 0;
      try
      {
        foreach (var (hash, fileName) in missing)
        {
          if (_stop) break;
          var path = Path.Combine(soundDirectory, fileName);
          if (!File.Exists(path)) continue;
          var entry = MeasureFile(path);
          if (entry != null)
          {
            _entries[hash] = entry;
            done++;
            if (done % 50 == 0) Save();
          }
        }
      }
      catch (Exception ex)
      {
        _logger.LogWarning(ex, "Loudness scan failed");
      }
      finally
      {
        _measuring = false;
        Save();
        _logger.LogInformation("Loudness scan: {Done}/{Missing} measured in {Sec:0.0} s", done, missing.Count, sw.Elapsed.TotalSeconds);
      }
    }

    /// <summary>Gated RMS (50 ms windows above -50 dBFS) and peak of a decoded mono 16 kHz stream.</summary>
    private Entry MeasureFile(string path)
    {
      try
      {
        var psi = new ProcessStartInfo("nice")
        {
          RedirectStandardOutput = true,
          RedirectStandardError = true,
          UseShellExecute = false,
          CreateNoWindow = true
        };
        foreach (var a in new[] { "mpg123", "-q", "-s", "-m", "-r", SampleRate.ToString(), path }) psi.ArgumentList.Add(a);
        using var proc = Process.Start(psi);
        if (proc == null) return null;
        _ = proc.StandardError.ReadToEndAsync();
        var stream = proc.StandardOutput.BaseStream;

        var buf = new byte[Window * 2];
        double energySum = 0, peak = 0;
        long gatedWindows = 0, samples = 0;
        int filled = 0, read;
        while ((read = stream.Read(buf, filled, buf.Length - filled)) > 0)
        {
          filled += read;
          if (filled < buf.Length) continue;
          double sum = 0;
          for (int i = 0; i < Window; i++)
          {
            double s = (short)(buf[2 * i] | (buf[2 * i + 1] << 8)) / 32768.0;
            sum += s * s;
            var abs = Math.Abs(s);
            if (abs > peak) peak = abs;
          }
          samples += Window;
          var ms = sum / Window;
          if (10 * Math.Log10(ms + 1e-12) > GateDb)
          {
            energySum += ms;
            gatedWindows++;
          }
          filled = 0;
        }
        if (!proc.WaitForExit(10000)) proc.Kill();
        if (samples < SampleRate / 10) return null;

        return new Entry
        {
          LoudnessDb = gatedWindows > 0 ? Math.Round(10 * Math.Log10(energySum / gatedWindows), 1) : -99,
          PeakDb = Math.Round(20 * Math.Log10(peak + 1e-9), 1)
        };
      }
      catch (Exception ex)
      {
        _logger.LogDebug("Loudness measure failed for {Path}: {Message}", path, ex.Message);
        return null;
      }
    }

    private static bool HasMpg123()
    {
      if (OperatingSystem.IsWindows()) return false;
      return (Environment.GetEnvironmentVariable("PATH") ?? "")
        .Split(':').Any(p => File.Exists(Path.Combine(p, "mpg123")));
    }

    private void Load()
    {
      try
      {
        if (!File.Exists(_storePath)) return;
        var store = JsonConvert.DeserializeObject<Store>(File.ReadAllText(_storePath));
        if (store == null) return;
        _enabled = store.Enabled;
        _targetDb = store.TargetDb;
        foreach (var kv in store.Sounds ?? new()) _entries[kv.Key] = kv.Value;
      }
      catch (Exception ex)
      {
        _logger.LogWarning("Loudness store unreadable ({Message}), starting fresh", ex.Message);
      }
    }

    private void Save()
    {
      if (_storePath == null) return;
      lock (_fileLock)
      {
        try
        {
          var store = new Store
          {
            Enabled = _enabled,
            TargetDb = _targetDb,
            Sounds = _entries.OrderBy(k => k.Key).ToDictionary(k => k.Key, k => k.Value)
          };
          var tmp = _storePath + ".tmp";
          File.WriteAllText(tmp, JsonConvert.SerializeObject(store, Formatting.Indented));
          File.Move(tmp, _storePath, true);
        }
        catch (Exception ex)
        {
          _logger.LogWarning("Loudness store not saved: {Message}", ex.Message);
        }
      }
    }
  }
}
