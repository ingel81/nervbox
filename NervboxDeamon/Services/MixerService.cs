using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using NervboxDeamon.Services.Audio;

namespace NervboxDeamon.Services
{
  /// <summary>
  /// Software mixer for Local playback (AppSettings.LocalPlayer = "mixer"): every sound is decoded
  /// by its own mpg123 (raw PCM to stdout) or read from WAV, run through its per-voice DSP chain
  /// (effects + live control), mixed, limited on the master bus and written to ONE long-running
  /// aplay stream. Removes the 8-voice limit of the bcm2835 jack (one ALSA subdevice per process).
  /// MixerDevice "none" = internal null sink paced by the clock (tests / machines without ALSA).
  /// </summary>
  public interface IMixerService
  {
    /// <summary>Fire-and-forget play (TTS, bench). Returns the voice id or 0 if it could not start.</summary>
    int Play(string filePath, double gain);
    /// <summary>Play with a caller-chosen voice id (> 0) and optional effect. False = not started.</summary>
    bool Play(MixerPlayRequest request);
    bool StopVoice(int voiceId);
    /// <summary>Live control: rate 0.5–2 (pitch+speed), filter -1 (low-pass) … +1 (high-pass), wobble 0–1.</summary>
    bool SetLive(int voiceId, double rate, double filter, double wobble);
    bool IsPlaying(int voiceId);
    void StopAll();
    void Shutdown();
    MixerStats GetStats();

    /// <summary>(voiceId, reason "end" | "stopped" | "error") – raised on a pool thread.</summary>
    event Action<int, string> VoiceEnded;
    /// <summary>Master/voice levels ~12×/s while voices play (one final all-zero frame when idle).</summary>
    event Action<MixerLevels> Levels;
  }

  public class MixerPlayRequest
  {
    public int VoiceId { get; set; }
    public string FilePath { get; set; }
    /// <summary>Pre-decoded interleaved stereo 48 kHz PCM instead of a file (tests).</summary>
    public short[] Pcm { get; set; }
    public double Gain { get; set; } = 1.0;
    public SoundEffect Effect { get; set; }
  }

  public class MixerStats
  {
    public bool Running { get; set; }
    public string Device { get; set; }
    public int ActiveVoices { get; set; }
    public int PeakVoices { get; set; }
    public long Underruns { get; set; }
    /// <summary>Samples that hit the soft clipper after the limiter (was: hard clipped)</summary>
    public long Clipped { get; set; }
    public double LimiterGain { get; set; }
    public double AvgMixUs { get; set; }
    public double MaxMixUs { get; set; }
  }

  public class MixerLevels
  {
    /// <summary>Master peak (0…1, post limiter) over the last ~80 ms</summary>
    public double Peak { get; set; }
    public double Rms { get; set; }
    /// <summary>Gain reduction of the master limiter in dB (0 = none)</summary>
    public double LimiterDb { get; set; }
    public List<VoiceLevel> Voices { get; set; } = new();
  }

  public class VoiceLevel
  {
    public int Id { get; set; }
    public double Peak { get; set; }
  }

  public class MixerService : IMixerService
  {
    public const int Rate = FxParams.Rate;
    private const int Channels = 2;
    private const int PeriodFrames = 480; // 10 ms
    public const int MaxVoices = 32;
    private const int LevelEveryBlocks = 8; // 80 ms -> 12.5 frames/s

    private readonly ILogger<MixerService> _logger;
    private readonly object _startLock = new();
    private readonly ConcurrentDictionary<int, Voice> _voices = new();
    private int _autoId;
    private Thread _mixThread;
    private Process _aplay;
    private Stream _sink;
    private volatile bool _running;
    private volatile int _gen;
    private string _device = "default";
    private int _bufferMs = 60;
    private readonly Limiter _limiter = new();

    private int _peakVoices;
    private long _underruns, _mixTicks, _mixCount, _maxMixTicks;

    public event Action<int, string> VoiceEnded;
    public event Action<MixerLevels> Levels;

    public MixerService(ILogger<MixerService> logger)
    {
      _logger = logger;
    }

    public void Configure(string device, int bufferMs)
    {
      if (!string.IsNullOrWhiteSpace(device)) _device = device;
      if (bufferMs > 0) _bufferMs = bufferMs;
    }

    private bool NullSink => _device == "none";

    public int Play(string filePath, double gain)
    {
      int id = Interlocked.Decrement(ref _autoId); // anonymous voices get negative ids
      return Play(new MixerPlayRequest { VoiceId = id, FilePath = filePath, Gain = gain }) ? id : 0;
    }

    public bool Play(MixerPlayRequest req)
    {
      if (_voices.Count >= MaxVoices)
      {
        _logger.LogWarning("Mixer: {Max} voices active, dropping {File}", MaxVoices, Path.GetFileName(req.FilePath ?? "pcm"));
        return false;
      }
      if (_voices.ContainsKey(req.VoiceId)) return false;
      if (!NullSink && !OutputAvailable()) return false;

      PcmSource src;
      try
      {
        bool reverse = req.Effect == SoundEffect.Reverse;
        if (req.Pcm != null) src = new BufferSource(req.Pcm);
        else if (req.FilePath.EndsWith(".wav", StringComparison.OrdinalIgnoreCase)) src = new WavSource(req.FilePath, _logger);
        else src = new Mpg123Source(req.FilePath, throttle: !reverse, _logger);
      }
      catch (Exception ex)
      {
        _logger.LogWarning("Mixer: cannot start decoder for {File}: {Message}", Path.GetFileName(req.FilePath ?? "pcm"), ex.Message);
        return false;
      }

      var voice = new Voice(req.VoiceId, src, req.Gain, req.Effect);
      // start + add under the lock: the mix thread only goes idle under the same lock with no voices
      lock (_startLock)
      {
        if (!EnsureRunningLocked() || !_voices.TryAdd(req.VoiceId, voice))
        {
          voice.Dispose();
          return false;
        }
      }
      var n = _voices.Count;
      if (n > _peakVoices) _peakVoices = n;
      return true;
    }

    /// <summary>aplay failed recently (no ALSA, Windows): don't spawn decoders for nothing.</summary>
    private DateTime _outputFailedAt = DateTime.MinValue;
    private bool OutputAvailable() => (DateTime.UtcNow - _outputFailedAt).TotalSeconds > 10;

    public bool StopVoice(int voiceId)
    {
      if (!_voices.TryGetValue(voiceId, out var v)) return false;
      v.RequestStop(); // 10 ms fade-out in the mix thread, no click
      if (!_running) Remove(voiceId, "stopped");
      return true;
    }

    public bool SetLive(int voiceId, double rate, double filter, double wobble)
    {
      if (!_voices.TryGetValue(voiceId, out var v)) return false;
      v.SetLive(rate, filter, wobble);
      return true;
    }

    public bool IsPlaying(int voiceId) => _voices.ContainsKey(voiceId);

    public void StopAll()
    {
      foreach (var kv in _voices)
      {
        kv.Value.RequestStop();
        if (!_running) Remove(kv.Key, "stopped");
      }
    }

    public void Shutdown()
    {
      _running = false;
      _mixThread?.Join(1000);
      foreach (var kv in _voices) Remove(kv.Key, "stopped");
      try { _aplay?.Kill(); } catch { /* already gone */ }
    }

    public MixerStats GetStats() => new MixerStats
    {
      Running = _running,
      Device = _device,
      ActiveVoices = _voices.Count,
      PeakVoices = _peakVoices,
      Underruns = Interlocked.Read(ref _underruns),
      Clipped = _limiter.SoftClipped,
      LimiterGain = Math.Round(_limiter.Gain, 3),
      AvgMixUs = _mixCount > 0 ? Math.Round(_mixTicks * 1_000_000.0 / Stopwatch.Frequency / _mixCount, 1) : 0,
      MaxMixUs = Math.Round(_maxMixTicks * 1_000_000.0 / Stopwatch.Frequency, 1)
    };

    private void Remove(int id, string reason)
    {
      if (!_voices.TryRemove(id, out var v)) return;
      v.Dispose();
      var handler = VoiceEnded;
      if (handler != null) ThreadPool.QueueUserWorkItem(_ => { try { handler(id, reason); } catch (Exception ex) { _logger.LogDebug("VoiceEnded handler: {Message}", ex.Message); } });
    }

    private bool EnsureRunningLocked()
    {
      {
        if (_running && (NullSink || _aplay is { HasExited: false })) return true;
        _running = false;
        _mixThread?.Join(500);

        if (NullSink)
        {
          _aplay = null;
          _sink = Stream.Null;
        }
        else
        {
          var psi = new ProcessStartInfo("aplay")
          {
            RedirectStandardInput = true,
            UseShellExecute = false,
            CreateNoWindow = true
          };
          foreach (var a in new[] { "-q", "-D", _device, "-t", "raw", "-f", "S16_LE", "-r", Rate.ToString(), "-c", Channels.ToString(),
                     $"--buffer-time={_bufferMs * 1000}", $"--period-time={10_000}" })
            psi.ArgumentList.Add(a);
          try
          {
            _aplay = Process.Start(psi);
          }
          catch (Exception ex)
          {
            // e.g. Windows dev box or ALSA missing: Local mode degrades to "no sound" instead of crashing
            _logger.LogWarning("Mixer: cannot start aplay ({Message}) - no local audio output", ex.Message);
            _aplay = null;
            _outputFailedAt = DateTime.UtcNow;
            return false;
          }
          _sink = _aplay.StandardInput.BaseStream;
        }
        _running = true;
        int gen = ++_gen;
        _mixThread = new Thread(() => MixLoop(gen)) { IsBackground = true, Name = "Mixer", Priority = ThreadPriority.AboveNormal };
        _mixThread.Start();
        _logger.LogInformation("Mixer started on ALSA device {Device}, buffer {Buffer} ms", _device, _bufferMs);
        return true;
      }
    }

    private void MixLoop(int gen)
    {
      var acc = new float[PeriodFrames * Channels];
      var outBytes = new byte[PeriodFrames * Channels * 2];
      var sink = _sink;
      var idleSince = DateTime.UtcNow;
      var ended = new List<(int id, string reason)>();
      // null sink: pace by the clock
      var clock = Stopwatch.StartNew();
      long blocksDone = 0;

      float lvlPeak = 0; double lvlSq = 0; int lvlBlocks = 0; float lvlMinGain = 1;
      var voicePeaks = new Dictionary<int, float>();
      bool levelsActive = false;

      try
      {
        while (_running && gen == _gen)
        {
          long t0 = Stopwatch.GetTimestamp();
          Array.Clear(acc);
          ended.Clear();
          foreach (var kv in _voices)
          {
            var v = kv.Value;
            v.Process(acc, PeriodFrames, out bool underrun);
            if (underrun) Interlocked.Increment(ref _underruns);
            voicePeaks[kv.Key] = Math.Max(voicePeaks.GetValueOrDefault(kv.Key), v.BlockPeak);
            if (v.Done) ended.Add((kv.Key, v.EndReason));
          }
          foreach (var (id, reason) in ended) Remove(id, reason);

          _limiter.Process(acc, PeriodFrames);
          if (_limiter.Gain < lvlMinGain) lvlMinGain = _limiter.Gain;

          for (int i = 0; i < acc.Length; i++)
          {
            float x = acc[i];
            float a = Math.Abs(x);
            if (a > lvlPeak) lvlPeak = a;
            lvlSq += x * x;
            int s = (int)(x * 32767f);
            if (s > short.MaxValue) s = short.MaxValue; else if (s < short.MinValue) s = short.MinValue;
            outBytes[2 * i] = (byte)s;
            outBytes[2 * i + 1] = (byte)(s >> 8);
          }
          long dt = Stopwatch.GetTimestamp() - t0;
          _mixTicks += dt;
          if (dt > _maxMixTicks && _mixCount > 10) _maxMixTicks = dt;
          _mixCount++;

          if (++lvlBlocks >= LevelEveryBlocks)
          {
            bool any = !_voices.IsEmpty;
            if (any || levelsActive) EmitLevels(lvlPeak, Math.Sqrt(lvlSq / (lvlBlocks * acc.Length)), lvlMinGain, voicePeaks, any);
            levelsActive = any;
            lvlPeak = 0; lvlSq = 0; lvlBlocks = 0; lvlMinGain = 1;
            voicePeaks.Clear();
          }

          if (sink == Stream.Null)
          {
            blocksDone++;
            long due = blocksDone * 10;
            long wait = due - clock.ElapsedMilliseconds;
            if (wait > 0) Thread.Sleep((int)wait);
          }
          else
          {
            // blocks while aplay's buffer is full -> paces the loop at real time
            sink.Write(outBytes, 0, outBytes.Length);
          }

          if (_voices.IsEmpty)
          {
            // release the ALSA device after 30 s of silence (under the lock: Play() may be adding a voice)
            if ((DateTime.UtcNow - idleSince).TotalSeconds > 30)
            {
              if (Monitor.TryEnter(_startLock))
              {
                try
                {
                  if (_voices.IsEmpty && gen == _gen) { _running = false; break; }
                }
                finally { Monitor.Exit(_startLock); }
              }
            }
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
        bool current = gen == _gen;
        if (current) _running = false;
        if (sink != Stream.Null)
        {
          try { sink.Close(); } catch { /* ignore */ }
          try { if (_aplay != null && !_aplay.WaitForExit(1000)) _aplay.Kill(); } catch { /* ignore */ }
        }
        // voices still queued (e.g. aplay died) end now so clients don't wait forever
        if (current) foreach (var kv in _voices) Remove(kv.Key, "error");
      }
    }

    private void EmitLevels(float peak, double rms, float minGain, Dictionary<int, float> voicePeaks, bool any)
    {
      var handler = Levels;
      if (handler == null) return;
      var lv = new MixerLevels
      {
        Peak = any ? Math.Round(peak, 3) : 0,
        Rms = any ? Math.Round(rms, 3) : 0,
        LimiterDb = any ? Math.Round(-20 * Math.Log10(Math.Max(minGain, 1e-4f)), 1) : 0
      };
      if (any) foreach (var kv in voicePeaks) lv.Voices.Add(new VoiceLevel { Id = kv.Key, Peak = Math.Round(kv.Value, 3) });
      ThreadPool.QueueUserWorkItem(_ => { try { handler(lv); } catch { /* ignore */ } });
    }

    // ------------------------------------------------------------------ sources

    /// <summary>Interleaved stereo int16 @ 48 kHz in chunks, filled by a decoder in the background.</summary>
    internal abstract class PcmSource : IDisposable
    {
      protected readonly ConcurrentQueue<short[]> Chunks = new();
      protected volatile bool _finished;
      protected volatile bool _started;
      public bool Finished => _finished;
      public bool Started => _started;
      public bool IsEmpty => Chunks.IsEmpty;
      public bool TryTake(out short[] chunk) => Chunks.TryDequeue(out chunk);

      protected void EnqueueAll(short[] pcm)
      {
        const int chunkSamples = 4800 * 2; // 100 ms
        for (int o = 0; o < pcm.Length; o += chunkSamples)
        {
          var c = new short[Math.Min(chunkSamples, pcm.Length - o)];
          Array.Copy(pcm, o, c, 0, c.Length);
          Chunks.Enqueue(c);
        }
        _started = pcm.Length > 0;
      }

      public virtual void Dispose() { }
    }

    internal sealed class BufferSource : PcmSource
    {
      public BufferSource(short[] pcm)
      {
        EnqueueAll(pcm);
        _finished = true;
      }
    }

    internal sealed class WavSource : PcmSource
    {
      public WavSource(string path, ILogger logger)
      {
        _ = Task.Run(() =>
        {
          try { EnqueueAll(WavReader.DecodeFile(path)); }
          catch (Exception ex) { logger.LogWarning("Mixer: WAV decode failed for {File}: {Message}", Path.GetFileName(path), ex.Message); }
          finally { _finished = true; }
        });
      }
    }

    internal sealed class Mpg123Source : PcmSource
    {
      private readonly Process _proc;
      private readonly CancellationTokenSource _cts = new();

      public Mpg123Source(string path, bool throttle, ILogger logger)
      {
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
        _ = Task.Run(() => Pump(logger, throttle));
      }

      private async Task Pump(ILogger logger, bool throttle)
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
            _started = true;
            Chunks.Enqueue(chunk);
            // don't decode more than ~3 s ahead (reverse needs everything up front)
            while (throttle && Chunks.Count > 75 && !_cts.IsCancellationRequested) await Task.Delay(20);
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

      public override void Dispose()
      {
        _cts.Cancel();
        try { if (!_proc.HasExited) _proc.Kill(); } catch { /* gone */ }
        _proc.Dispose();
      }
    }

    // ------------------------------------------------------------------ voice

    /// <summary>
    /// One playing sound. Chain (identical order in the browser engine):
    /// variable-rate resampler (effect rate × live rate) → telephone band-pass → live LP/HP sweep →
    /// tremolo (wobble) → echo / reverb → loudness gain → master bus.
    /// All live parameters glide with a 30 ms one-pole per 10 ms block and are ramped per sample.
    /// </summary>
    internal sealed class Voice : IDisposable
    {
      private const int MaxReverseFrames = 90 * Rate;
      private static readonly float Smooth = (float)(1 - Math.Exp(-(PeriodFrames / (double)Rate) / FxParams.SmoothingSec));

      public readonly int Id;
      private readonly PcmSource _src;
      private readonly float _gain;
      private readonly SoundEffect _fx;
      private readonly float _fxRate;
      private readonly bool _reverse;

      private float[] _buf = new float[8192 * 2];
      private int _bufFrames;
      private double _pos;
      private bool _reversed;
      private bool _srcDone, _everProduced;
      private int _tailLeft, _tailTotal;
      private float[] _tmp = new float[PeriodFrames * 2];

      // live control (written by hub threads, read by the mix thread)
      private volatile float _tRate = 1, _tFilter, _tWobble;
      private volatile bool _live;
      private float _rate, _filter, _wobble = 0;
      private float _appliedFilter = float.NaN;
      private double _lfoPhase;

      private readonly Biquad _phoneHp, _phoneLp, _liveLp = new(), _liveHp = new();
      private readonly EchoFx _echo;
      private readonly ReverbFx _reverb;

      private volatile bool _stop;
      private float _fade = 1;

      public bool Done { get; private set; }
      public string EndReason { get; private set; } = "end";
      public float BlockPeak { get; private set; }

      public Voice(int id, PcmSource src, double gain, SoundEffect fx)
      {
        Id = id;
        _src = src;
        _gain = (float)gain;
        _fx = fx;
        _fxRate = (float)FxParams.EffectRate(fx);
        _rate = _fxRate;
        _reverse = fx == SoundEffect.Reverse;
        if (fx == SoundEffect.Telephone)
        {
          _phoneHp = new Biquad(); _phoneHp.SetHighpass(FxParams.PhoneLowHz);
          _phoneLp = new Biquad(); _phoneLp.SetLowpass(FxParams.PhoneHighHz);
        }
        if (fx == SoundEffect.Echo) _echo = new EchoFx();
        if (fx == SoundEffect.Reverb) _reverb = new ReverbFx();
      }

      public void RequestStop() => _stop = true;

      public void SetLive(double rate, double filter, double wobble)
      {
        _tRate = (float)Math.Clamp(double.IsFinite(rate) ? rate : 1, FxParams.LiveRateMin, FxParams.LiveRateMax);
        _tFilter = (float)Math.Clamp(double.IsFinite(filter) ? filter : 0, -1, 1);
        _tWobble = (float)Math.Clamp(double.IsFinite(wobble) ? wobble : 0, 0, 1);
        _live = true;
      }

      private void Append(short[] c)
      {
        int frames = c.Length / 2;
        if ((_bufFrames + frames) * 2 > _buf.Length)
        {
          int size = _buf.Length;
          while (size < (_bufFrames + frames) * 2) size *= 2;
          Array.Resize(ref _buf, size);
        }
        int o = _bufFrames * 2;
        const float k = 1f / 32768f;
        for (int i = 0; i < c.Length; i++) _buf[o + i] = c[i] * k;
        _bufFrames += frames;
      }

      public void Process(float[] acc, int frames, out bool underrun)
      {
        underrun = false;
        BlockPeak = 0;
        var tmp = _tmp;
        bool live = _live;

        // glide live params
        float rTarget = _fxRate * (live ? _tRate : 1f);
        float rStart = _rate;
        _rate += (rTarget - _rate) * Smooth;
        float rEnd = _rate;
        float fStartF = _filter;
        if (live)
        {
          _filter += (_tFilter - _filter) * Smooth;
        }
        float fEndF = _filter;
        float wStart = _wobble;
        _wobble += ((live ? _tWobble : 0f) - _wobble) * Smooth;
        float wEnd = _wobble;

        if (_reverse && !_reversed)
        {
          while (_bufFrames < MaxReverseFrames && _src.TryTake(out var c)) Append(c);
          bool exhausted = (_src.Finished && _src.IsEmpty) || _bufFrames >= MaxReverseFrames;
          if (!exhausted)
          {
            if (_stop) { Done = true; EndReason = "stopped"; }
            return; // still decoding: silence
          }
          ReverseBuffer();
          _reversed = true;
        }

        int produced = 0;
        if (!_srcDone)
        {
          if (!_reverse)
          {
            int need = (int)(_pos + Math.Max(rStart, rEnd) * frames) + 2;
            while (_bufFrames < need && _src.TryTake(out var c)) Append(c);
          }
          var buf = _buf;
          int bf = _bufFrames;
          double pos = _pos;
          float dr = (rEnd - rStart) / frames;
          for (; produced < frames; produced++)
          {
            int i0 = (int)pos;
            if (i0 + 1 >= bf) break;
            float frac = (float)(pos - i0);
            int j = i0 * 2;
            tmp[2 * produced] = buf[j] + (buf[j + 2] - buf[j]) * frac;
            tmp[2 * produced + 1] = buf[j + 1] + (buf[j + 3] - buf[j + 1]) * frac;
            pos += rStart + dr * produced;
          }
          _pos = pos;
          if (produced > 0) _everProduced = true;
          if (produced < frames)
          {
            bool finished = _src.Finished; // read before IsEmpty: the pump sets it after the last enqueue
            bool exhausted = _reverse || (finished && _src.IsEmpty);
            if (exhausted)
            {
              _srcDone = true;
              _tailTotal = _tailLeft = (int)(FxParams.TailSec(_fx) * Rate);
            }
            else if (_src.Started) underrun = true;
          }
          // drop consumed frames (not for reverse: that buffer holds the whole sound)
          int shift = (int)_pos - 1;
          if (!_reverse && shift >= 2048)
          {
            Array.Copy(_buf, shift * 2, _buf, 0, (_bufFrames - shift) * 2);
            _bufFrames -= shift;
            _pos -= shift;
          }
        }
        else
        {
          _tailLeft -= frames;
        }
        if (produced < frames) Array.Clear(tmp, produced * 2, (frames - produced) * 2);

        // telephone: mono band-pass
        if (_phoneHp != null)
        {
          for (int i = 0; i < frames; i++)
          {
            float m = (tmp[2 * i] + tmp[2 * i + 1]) * 0.5f;
            tmp[2 * i] = m; tmp[2 * i + 1] = m;
          }
          _phoneHp.Process(tmp, frames);
          _phoneLp.Process(tmp, frames);
          const float pg = (float)FxParams.PhoneGain;
          for (int i = 0; i < frames * 2; i++) tmp[i] *= pg;
        }

        // live filter sweep: coefficients follow the glide every 60 frames (1.25 ms)
        if (live)
        {
          if (float.IsNaN(_appliedFilter))
          {
            // first modulation of a running voice
            _liveLp.Prime(tmp[0], tmp[1]);
            _liveHp.Prime(tmp[0], tmp[1]);
          }
          const int sub = 60;
          for (int o = 0; o < frames; o += sub)
          {
            int len = Math.Min(sub, frames - o);
            float f = fStartF + (fEndF - fStartF) * (o + len) / frames;
            if (!(Math.Abs(f - _appliedFilter) < 1e-4f))
            {
              var (lpHz, hpHz) = FxParams.LiveFilter(f);
              _liveLp.SetLowpass(lpHz);
              _liveHp.SetHighpass(hpHz);
              _appliedFilter = f;
            }
            _liveLp.Process(tmp, o, len);
            _liveHp.Process(tmp, o, len);
          }
        }

        // tremolo
        if (wStart > 1e-4f || wEnd > 1e-4f)
        {
          double dPhase = 2 * Math.PI * FxParams.TremoloHz / Rate;
          double ph = _lfoPhase;
          float dw = (wEnd - wStart) / frames;
          for (int i = 0; i < frames; i++)
          {
            float d = wStart + dw * i;
            float g = 1 - d * 0.5f + d * 0.5f * (float)Math.Sin(ph);
            tmp[2 * i] *= g; tmp[2 * i + 1] *= g;
            ph += dPhase;
          }
          _lfoPhase = ph % (2 * Math.PI);
        }
        else _lfoPhase = (_lfoPhase + 2 * Math.PI * FxParams.TremoloHz * frames / Rate) % (2 * Math.PI);

        _echo?.Process(tmp, frames);
        _reverb?.Process(tmp, frames);

        // gain + stop fade, mix
        float fStart = _fade, fEnd = _stop ? 0f : 1f;
        float df = (fEnd - fStart) / frames;
        float peak = 0;
        for (int i = 0; i < frames; i++)
        {
          float g = _gain * (fStart + df * i);
          float l = tmp[2 * i] * g, r = tmp[2 * i + 1] * g;
          acc[2 * i] += l; acc[2 * i + 1] += r;
          float a = Math.Max(Math.Abs(l), Math.Abs(r));
          if (a > peak) peak = a;
        }
        _fade = fEnd;
        BlockPeak = peak;

        if (_stop) { Done = true; EndReason = "stopped"; return; }
        if (_srcDone)
        {
          // tail of echo/reverb: end early once it has decayed to silence
          bool decayed = _tailTotal - _tailLeft > Rate / 2 && peak < 1e-4f;
          if (_tailLeft <= 0 || decayed)
          {
            Done = true;
            EndReason = _everProduced ? "end" : "error";
          }
        }
      }

      private void ReverseBuffer()
      {
        int a = 0, b = _bufFrames - 1;
        while (a < b)
        {
          (_buf[2 * a], _buf[2 * b]) = (_buf[2 * b], _buf[2 * a]);
          (_buf[2 * a + 1], _buf[2 * b + 1]) = (_buf[2 * b + 1], _buf[2 * a + 1]);
          a++; b--;
        }
        _pos = 0;
      }

      public void Dispose() => _src.Dispose();
    }
  }
}
