using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace NervboxDeamon.Services
{
  /// <summary>
  /// Software mixer for Local playback (AppSettings.LocalPlayer = "mixer"): every sound is decoded
  /// by its own mpg123 (raw PCM to stdout), mixed here and written to ONE long-running aplay stream.
  /// Removes the 8-voice limit of the bcm2835 jack (one ALSA subdevice per player process).
  /// </summary>
  public interface IMixerService
  {
    void Play(string filePath, double gain);
    void StopAll();
    void Shutdown();
    MixerStats GetStats();
  }

  public class MixerStats
  {
    public bool Running { get; set; }
    public int ActiveVoices { get; set; }
    public int PeakVoices { get; set; }
    public long Underruns { get; set; }
    public long Clipped { get; set; }
    public double AvgMixUs { get; set; }
  }

  public class MixerService : IMixerService
  {
    private const int Rate = 48000;
    private const int Channels = 2;
    private const int PeriodFrames = 480; // 10 ms
    private const int MaxVoices = 32;

    private readonly ILogger<MixerService> _logger;
    private readonly object _startLock = new();
    private readonly ConcurrentDictionary<int, Voice> _voices = new();
    private int _nextId;
    private Thread _mixThread;
    private Process _aplay;
    private volatile bool _running;
    private string _device = "default";
    private int _bufferMs = 60;

    private int _peakVoices;
    private long _underruns, _clipped, _mixTicks, _mixCount;

    public MixerService(ILogger<MixerService> logger)
    {
      _logger = logger;
    }

    public void Configure(string device, int bufferMs)
    {
      if (!string.IsNullOrWhiteSpace(device)) _device = device;
      if (bufferMs > 0) _bufferMs = bufferMs;
    }

    public void Play(string filePath, double gain)
    {
      EnsureRunning();
      if (_voices.Count >= MaxVoices)
      {
        _logger.LogWarning("Mixer: {Max} voices active, dropping {File}", MaxVoices, Path.GetFileName(filePath));
        return;
      }
      var voice = new Voice(filePath, gain, _logger);
      _voices[Interlocked.Increment(ref _nextId)] = voice;
      var n = _voices.Count;
      if (n > _peakVoices) _peakVoices = n;
    }

    public void StopAll()
    {
      foreach (var kv in _voices)
      {
        if (_voices.TryRemove(kv.Key, out var v)) v.Dispose();
      }
    }

    public void Shutdown()
    {
      _running = false;
      StopAll();
      _mixThread?.Join(1000);
      try { _aplay?.Kill(); } catch { /* already gone */ }
    }

    public MixerStats GetStats() => new MixerStats
    {
      Running = _running,
      ActiveVoices = _voices.Count,
      PeakVoices = _peakVoices,
      Underruns = Interlocked.Read(ref _underruns),
      Clipped = Interlocked.Read(ref _clipped),
      AvgMixUs = _mixCount > 0 ? Math.Round(_mixTicks * 1_000_000.0 / Stopwatch.Frequency / _mixCount, 1) : 0
    };

    private void EnsureRunning()
    {
      if (_running && _aplay is { HasExited: false }) return;
      lock (_startLock)
      {
        if (_running && _aplay is { HasExited: false }) return;
        _running = false;
        _mixThread?.Join(500);

        var psi = new ProcessStartInfo("aplay")
        {
          RedirectStandardInput = true,
          UseShellExecute = false,
          CreateNoWindow = true
        };
        foreach (var a in new[] { "-q", "-D", _device, "-t", "raw", "-f", "S16_LE", "-r", Rate.ToString(), "-c", Channels.ToString(),
                   $"--buffer-time={_bufferMs * 1000}", $"--period-time={10_000}" })
          psi.ArgumentList.Add(a);
        _aplay = Process.Start(psi);
        _running = true;
        _mixThread = new Thread(MixLoop) { IsBackground = true, Name = "Mixer", Priority = ThreadPriority.AboveNormal };
        _mixThread.Start();
        _logger.LogInformation("Mixer started on ALSA device {Device}, buffer {Buffer} ms", _device, _bufferMs);
      }
    }

    private void MixLoop()
    {
      var acc = new int[PeriodFrames * Channels];
      var outBytes = new byte[PeriodFrames * Channels * 2];
      var sampleBuf = new short[PeriodFrames * Channels];
      var stdin = _aplay.StandardInput.BaseStream;
      var idleSince = DateTime.UtcNow;

      try
      {
        while (_running)
        {
          long t0 = Stopwatch.GetTimestamp();
          Array.Clear(acc);
          foreach (var kv in _voices)
          {
            var v = kv.Value;
            int got = v.Read(sampleBuf);
            if (got < sampleBuf.Length && v.Started && !v.Finished) Interlocked.Increment(ref _underruns);
            int g = (int)(v.Gain * 65536);
            for (int i = 0; i < got; i++) acc[i] += (sampleBuf[i] * g) >> 16;
            if (v.Finished && v.Drained)
            {
              if (_voices.TryRemove(kv.Key, out var done)) done.Dispose();
            }
          }

          for (int i = 0; i < acc.Length; i++)
          {
            int s = acc[i];
            if (s > short.MaxValue) { s = short.MaxValue; _clipped++; }
            else if (s < short.MinValue) { s = short.MinValue; _clipped++; }
            outBytes[2 * i] = (byte)s;
            outBytes[2 * i + 1] = (byte)(s >> 8);
          }
          _mixTicks += Stopwatch.GetTimestamp() - t0;
          _mixCount++;

          // blocks while aplay's buffer is full -> paces the loop at real time
          stdin.Write(outBytes, 0, outBytes.Length);

          if (_voices.IsEmpty)
          {
            // release the ALSA device after 30 s of silence
            if ((DateTime.UtcNow - idleSince).TotalSeconds > 30) break;
          }
          else idleSince = DateTime.UtcNow;
        }
      }
      catch (Exception ex)
      {
        _logger.LogWarning("Mixer loop stopped: {Message}", ex.Message);
      }
      finally
      {
        _running = false;
        try { stdin.Close(); } catch { /* ignore */ }
        try { if (!_aplay.WaitForExit(1000)) _aplay.Kill(); } catch { /* ignore */ }
      }
    }

    /// <summary>One playing sound: mpg123 decodes into a queue of PCM chunks read by the mixer.</summary>
    private sealed class Voice : IDisposable
    {
      private readonly Process _proc;
      private readonly ConcurrentQueue<short[]> _chunks = new();
      private short[] _current;
      private int _pos;
      private volatile bool _finished;
      private readonly CancellationTokenSource _cts = new();

      public double Gain { get; }
      public bool Started { get; private set; }
      public bool Finished => _finished;
      public bool Drained => _chunks.IsEmpty && (_current == null || _pos >= _current.Length);

      public Voice(string path, double gain, ILogger logger)
      {
        Gain = gain;
        var psi = new ProcessStartInfo("mpg123")
        {
          RedirectStandardOutput = true,
          RedirectStandardError = true,
          UseShellExecute = false,
          CreateNoWindow = true
        };
        foreach (var a in new[] { "-q", "-s", "--stereo", "-r", Rate.ToString(), path }) psi.ArgumentList.Add(a);
        _proc = Process.Start(psi);
        _ = _proc.StandardError.ReadToEndAsync();
        _ = Task.Run(() => Pump(logger));
      }

      private async Task Pump(ILogger logger)
      {
        var stream = _proc.StandardOutput.BaseStream;
        var buf = new byte[PeriodFrames * Channels * 2 * 4];
        int carry = 0;
        try
        {
          while (!_cts.IsCancellationRequested)
          {
            int n = await stream.ReadAsync(buf.AsMemory(carry, buf.Length - carry), _cts.Token);
            if (n == 0) break;
            n += carry;
            int samples = n / 4 * 2; // whole stereo frames only, keeps L/R aligned
            if (samples == 0) { carry = n; continue; }
            var chunk = new short[samples];
            Buffer.BlockCopy(buf, 0, chunk, 0, samples * 2);
            carry = n - samples * 2;
            if (carry > 0) Buffer.BlockCopy(buf, samples * 2, buf, 0, carry);
            Started = true;
            _chunks.Enqueue(chunk);
            // don't decode more than ~3 s ahead
            while (_chunks.Count > 75 && !_cts.IsCancellationRequested) await Task.Delay(20);
          }
        }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
          logger.LogDebug("Mixer voice decode failed: {Message}", ex.Message);
        }
        finally
        {
          _finished = true;
        }
      }

      /// <summary>Fill dst with up to dst.Length samples, returns how many were available.</summary>
      public int Read(short[] dst)
      {
        int written = 0;
        while (written < dst.Length)
        {
          if (_current == null || _pos >= _current.Length)
          {
            if (!_chunks.TryDequeue(out _current)) { _current = null; break; }
            _pos = 0;
          }
          int take = Math.Min(dst.Length - written, _current.Length - _pos);
          Array.Copy(_current, _pos, dst, written, take);
          _pos += take;
          written += take;
        }
        return written;
      }

      public void Dispose()
      {
        _cts.Cancel();
        try { if (!_proc.HasExited) _proc.Kill(); } catch { /* gone */ }
        _proc.Dispose();
      }
    }
  }
}
