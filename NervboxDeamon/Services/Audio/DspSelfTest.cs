using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;

namespace NervboxDeamon.Services.Audio
{
  /// <summary>
  /// Numeric checks of the mixer DSP (GET /api/voice/selftest, admin). Pure computation, no audio
  /// device, safe on the production box. Each check reports measured values and pass/fail.
  /// </summary>
  public static class DspSelfTest
  {
    public class Check
    {
      public string Name { get; set; }
      public bool Pass { get; set; }
      public string Detail { get; set; }
    }

    public class Result
    {
      public bool AllPass { get; set; }
      public List<Check> Checks { get; set; } = new();
      public double CpuPercentOneCore16VoicesFx { get; set; }
      public double CpuPercentOneCore16VoicesDry { get; set; }
    }

    private const int R = FxParams.Rate;

    public static Result Run()
    {
      var res = new Result();
      void Add(string name, bool pass, string detail) => res.Checks.Add(new Check { Name = name, Pass = pass, Detail = detail });

      // 1) biquads (RBJ, Butterworth): -3 dB at cutoff, flat in the pass band, steep in the stop band
      {
        var lp = new Func<double, double>(f => { var b = new Biquad(); b.SetLowpass(1000); return GainDb(b.Process, f); });
        double p = lp(100), c = lp(1000), s = lp(8000);
        Add("Biquad Tiefpass 1 kHz", Math.Abs(p) < 0.3 && Math.Abs(c + 3.01) < 0.3 && s < -30,
          $"100 Hz {p:F2} dB, 1 kHz {c:F2} dB, 8 kHz {s:F1} dB");
        var hp = new Func<double, double>(f => { var b = new Biquad(); b.SetHighpass(1000); return GainDb(b.Process, f); });
        p = hp(8000); c = hp(1000); s = hp(100);
        Add("Biquad Hochpass 1 kHz", Math.Abs(p) < 0.3 && Math.Abs(c + 3.01) < 0.3 && s < -30,
          $"8 kHz {p:F2} dB, 1 kHz {c:F2} dB, 100 Hz {s:F1} dB");
      }

      // 2) telephone band-pass 300–3400 Hz (+ make-up gain)
      {
        double G(double f)
        {
          var hp = new Biquad(); hp.SetHighpass(FxParams.PhoneLowHz);
          var lp = new Biquad(); lp.SetLowpass(FxParams.PhoneHighHz);
          return GainDb((b, n) => { hp.Process(b, n); lp.Process(b, n); for (int i = 0; i < n * 2; i++) b[i] *= (float)FxParams.PhoneGain; }, f);
        }
        double lo = G(80), mid = G(1000), hi = G(10000);
        double mk = 20 * Math.Log10(FxParams.PhoneGain);
        Add("Telefon-Bandpass", lo < mid - 20 && Math.Abs(mid - mk) < 1 && hi < mid - 20,
          $"80 Hz {lo:F1} dB, 1 kHz {mid:F1} dB (Make-up {mk:F1}), 10 kHz {hi:F1} dB");
      }

      // 3) echo: impulse -> 1 at 0, wet at T, wet*fb at 2T
      {
        var e = new EchoFx();
        int n = (int)(R * 0.7);
        var buf = new float[n * 2];
        buf[0] = 1; buf[1] = 1;
        e.Process(buf, n);
        int d = (int)Math.Round(FxParams.EchoDelaySec * R);
        double a0 = buf[0], a1 = buf[2 * d], a2 = buf[4 * d];
        Add("Echo (Feedback-Delay)", Math.Abs(a0 - 1) < 1e-6 && Math.Abs(a1 - FxParams.EchoWet) < 1e-5 && Math.Abs(a2 - FxParams.EchoWet * FxParams.EchoFeedback) < 1e-5,
          $"t=0: {a0:F3}, t={FxParams.EchoDelaySec}s: {a1:F3}, t={2 * FxParams.EchoDelaySec}s: {a2:F4}");
      }

      // 4) reverb: impulse response decays, stereo decorrelated, energy in range
      {
        var rv = new ReverbFx();
        int n = (int)(R * FxParams.ReverbTailSec);
        var l = new float[n]; var r = new float[n];
        for (int i = 0; i < n; i++)
        {
          rv.Tick(i == 0 ? (float)FxParams.ReverbInputGain : 0f, out l[i], out r[i]);
        }
        double energy = l.Sum(x => (double)x * x);
        double eEarly = l.Take(R / 4).Sum(x => (double)x * x);
        double eLate = l.Skip(n - R / 4).Sum(x => (double)x * x);
        double decayDb = 10 * Math.Log10(eLate / eEarly);
        double corr = l.Zip(r, (a, b) => (double)a * b).Sum() / Math.Sqrt(energy * r.Sum(x => (double)x * x));
        // RT60 from Schroeder backward integration
        double rt60 = Rt60(l);
        Add("Hall (Schroeder/Freeverb-lite)", decayDb < -40 && Math.Abs(corr) < 0.5 && energy > 0.1 && energy < 2 && rt60 > 0.5 && rt60 < 2.5,
          $"IR-Energie {energy:F3}, Abfall erste→letzte 250 ms {decayDb:F0} dB, RT60 {rt60:F2} s, L/R-Korrelation {corr:F2}");
      }

      // 5) limiter: 16 full-scale voices never exceed 1.0, settle near the ceiling
      {
        var lim = new Limiter();
        int n = R; // 1 s
        var buf = new float[n * 2];
        for (int i = 0; i < n; i++)
        {
          double s = 0;
          for (int v = 0; v < 16; v++) s += 0.9 * Math.Sin(2 * Math.PI * (110 + 37 * v) * i / R + v);
          buf[2 * i] = (float)s; buf[2 * i + 1] = (float)s;
        }
        double inPeak = buf.Max(x => Math.Abs(x));
        lim.Process(buf, n);
        double outPeak = buf.Max(x => Math.Abs(x));
        double lateRms = Math.Sqrt(buf.Skip(n).Select(x => (double)x * x).Average());
        Add("Master-Limiter (16 Stimmen)", outPeak <= 1.0 && outPeak > 0.85 && lateRms > 0.2,
          $"Eingang Spitze {inPeak:F1} → Ausgang Spitze {outPeak:F3}, RMS {lateRms:F3}, Gain {20 * Math.Log10(lim.Gain):F1} dB");
        var quiet = new Limiter();
        var q = Sine(440, 0.5, 4800);
        var q0 = (float[])q.Clone();
        quiet.Process(q, 4800);
        double maxDiff = q.Zip(q0, (a, b) => Math.Abs(a - b)).Max();
        Add("Limiter transparent unter Schwelle", maxDiff < 1e-6, $"max. Abweichung bei -6 dBFS: {maxDiff:E1}");
      }

      // 6) WAV parse + resample 22.05 kHz mono -> 48 kHz stereo (Piper TTS format)
      {
        int inRate = 22050;
        var mono = new short[inRate];
        for (int i = 0; i < mono.Length; i++) mono[i] = (short)(16000 * Math.Sin(2 * Math.PI * 440 * i / inRate));
        var wav = WavReader.Encode16(mono, 1, inRate);
        var pcm = WavReader.Decode(wav);
        int frames = pcm.Length / 2;
        var left = Enumerable.Range(0, frames).Select(i => pcm[2 * i] / 32768f).ToArray();
        double freq = ZeroCrossFreq(left);
        bool stereoSame = Enumerable.Range(0, frames).All(i => pcm[2 * i] == pcm[2 * i + 1]);
        Add("WAV 22,05 kHz mono → 48 kHz stereo", Math.Abs(frames - 48000) <= 3 && Math.Abs(freq - 440) < 2 && stereoSame,
          $"{frames} Frames, Frequenz {freq:F1} Hz, L=R {stereoSame}");
      }

      // 7) voice: pitch up/down change length by the rate, reverse plays backwards
      {
        var src = Ramp(R); // 1 s, left = ramp 0..1
        int up = RenderLength(src, SoundEffect.PitchUp);
        int down = RenderLength(src, SoundEffect.PitchDown);
        Add("Pitch hoch/runter (Resampling)", Math.Abs(up - R / FxParams.PitchUpRate) < 600 && Math.Abs(down - R / FxParams.PitchDownRate) < 600,
          $"1,000 s → hoch {up / (double)R:F3} s (erwartet {1 / FxParams.PitchUpRate:F3}), runter {down / (double)R:F3} s (erwartet {1 / FxParams.PitchDownRate:F3})");

        var outRev = Render(src, SoundEffect.Reverse, null, out _);
        double first = outRev[0], mid = outRev[2 * (R / 2)], last = outRev[2 * (R - 10)];
        Add("Rückwärts", first > 0.99 && Math.Abs(mid - 0.5) < 0.01 && last < 0.01,
          $"Anfang {first:F3}, Mitte {mid:F3}, Ende {last:F3} (Rampe 0→1 rückwärts)");
      }

      // 8) live control: abrupt jumps glide (no zipper/clicks), filter sweep, wobble depth
      {
        var sine = SineStereoShort(220, 0.5, 2 * R);
        double maxStepDry = MaxStep(Render(sine, SoundEffect.None, null, out _));
        double maxStepLive = MaxStep(Render(sine, SoundEffect.None, (v, block) =>
        {
          // jump every 100 ms between the extremes - worst case for zipper noise
          // (first jump at 30 ms: the filters start in the middle of the running signal)
          if (block >= 3 && (block - 3) % 10 == 0) v.SetLive(block % 20 == 3 ? 2.0 : 0.5, block % 20 == 3 ? -1 : 1, block % 40 < 20 ? 1 : 0);
        }, out _));
        // a 2x pitch doubles the natural step of the sine; anything clearly above means discontinuities
        Add("Live-Steuerung ohne Knackser", maxStepLive < maxStepDry * 2.6,
          $"max. Sample-Sprung trocken {maxStepDry:F4}, mit Sprüngen alle 100 ms {maxStepLive:F4}");

        double Rms(float[] b) => Math.Sqrt(b.Skip(b.Length / 2).Take(b.Length / 4).Select(x => (double)x * x).Average());
        var low = SineStereoShort(150, 0.5, R);
        var high = SineStereoShort(6000, 0.5, R);
        double lowOpen = Rms(Render(low, SoundEffect.None, (v, _) => v.SetLive(1, 0, 0), out _));
        double highOpen = Rms(Render(high, SoundEffect.None, (v, _) => v.SetLive(1, 0, 0), out _));
        double highDark = Rms(Render(high, SoundEffect.None, (v, _) => v.SetLive(1, -1, 0), out _));
        double lowThin = Rms(Render(low, SoundEffect.None, (v, _) => v.SetLive(1, 1, 0), out _));
        double Db(double x, double r) => 20 * Math.Log10(x / r);
        Add("Live-Filter Tief-/Hochpass", Math.Abs(Db(lowOpen, 0.3536)) < 0.5 && Math.Abs(Db(highOpen, 0.3536)) < 0.5 && Db(highDark, highOpen) < -20 && Db(lowThin, lowOpen) < -20,
          $"offen: 150 Hz {Db(lowOpen, 0.3536):F1} dB, 6 kHz {Db(highOpen, 0.3536):F1} dB; ganz unten (-1): 6 kHz {Db(highDark, highOpen):F1} dB; ganz oben (+1): 150 Hz {Db(lowThin, lowOpen):F1} dB");

        var tone = SineStereoShort(1000, 0.5, R);
        var wob = Render(tone, SoundEffect.None, (v, _) => v.SetLive(1, 0, 1), out _);
        // RMS in 5 ms windows over the second half: tremolo swings between ~0 and full level
        var win = Enumerable.Range(0, 80).Select(w => Math.Sqrt(Enumerable.Range(R / 2 + w * 240, 240).Average(i => (double)wob[2 * i] * wob[2 * i]))).ToArray();
        double min = win.Min(), max = win.Max();
        Add("Wobble/Tremolo Tiefe", min < 0.05 && max > 0.3,
          $"1 kHz (RMS 0,354) mit Wobble 1: Fenster-RMS min {min:F3}, max {max:F3}, {FxParams.TremoloHz} Hz");
      }

      // 9) CPU: 16 voices, every effect + live control, 10 s audio
      {
        res.CpuPercentOneCore16VoicesFx = Bench(16, withFx: true);
        res.CpuPercentOneCore16VoicesDry = Bench(16, withFx: false);
        Add("CPU 16 Stimmen mit Effekten", res.CpuPercentOneCore16VoicesFx < 25,
          $"{res.CpuPercentOneCore16VoicesFx:F2} % eines Kerns (trocken {res.CpuPercentOneCore16VoicesDry:F2} %) – Ziel Pi 4 < 25 %");
      }

      res.AllPass = res.Checks.All(c => c.Pass);
      return res;
    }

    // ---------------------------------------------------------------- helpers

    private static double GainDb(Action<float[], int> process, double freq)
    {
      int n = R / 2;
      var buf = Sine(freq, 0.5, n);
      process(buf, n);
      double sq = 0;
      for (int i = n / 2; i < n; i++) sq += buf[2 * i] * (double)buf[2 * i];
      double rms = Math.Sqrt(sq / (n - n / 2));
      return 20 * Math.Log10(rms / (0.5 / Math.Sqrt(2)));
    }

    private static float[] Sine(double f, double amp, int frames)
    {
      var b = new float[frames * 2];
      for (int i = 0; i < frames; i++) b[2 * i] = b[2 * i + 1] = (float)(amp * Math.Sin(2 * Math.PI * f * i / R));
      return b;
    }

    private static short[] SineStereoShort(double f, double amp, int frames)
    {
      var b = new short[frames * 2];
      for (int i = 0; i < frames; i++) b[2 * i] = b[2 * i + 1] = (short)(32767 * amp * Math.Sin(2 * Math.PI * f * i / R));
      return b;
    }

    private static short[] NoiseStereoShort(int frames)
    {
      var rnd = new Random(42);
      var b = new short[frames * 2];
      for (int i = 0; i < b.Length; i++) b[i] = (short)rnd.Next(-16000, 16000);
      return b;
    }

    private static short[] Ramp(int frames)
    {
      var b = new short[frames * 2];
      for (int i = 0; i < frames; i++) b[2 * i] = b[2 * i + 1] = (short)(32767.0 * i / frames);
      return b;
    }

    private static double ZeroCrossFreq(float[] x)
    {
      int first = -1, last = -1, count = 0;
      for (int i = 1; i < x.Length; i++)
      {
        if (x[i - 1] < 0 && x[i] >= 0)
        {
          if (first < 0) first = i; else count++;
          last = i;
        }
      }
      return count > 0 ? count * (double)R / (last - first) : 0;
    }

    private static double Rt60(float[] ir)
    {
      var e = new double[ir.Length];
      double acc = 0;
      for (int i = ir.Length - 1; i >= 0; i--) { acc += ir[i] * (double)ir[i]; e[i] = acc; }
      double total = e[0];
      int t5 = Array.FindIndex(e, v => 10 * Math.Log10(v / total) < -5);
      int t25 = Array.FindIndex(e, v => 10 * Math.Log10(v / total) < -25);
      if (t5 < 0 || t25 <= t5) return 0;
      return (t25 - t5) / (double)R * 3; // T20 extrapolated to 60 dB
    }

    /// <summary>Largest sample-to-sample jump (left), ignoring the last 10 ms (sound ends there).</summary>
    private static double MaxStep(float[] b)
    {
      double m = 0;
      for (int i = 2; i < b.Length - 960; i += 2) m = Math.Max(m, Math.Abs(b[i] - b[i - 2]));
      return m;
    }

    /// <summary>Render a voice until it is done; returns the interleaved output.</summary>
    private static float[] Render(short[] pcm, SoundEffect fx, Action<MixerService.Voice, int> perBlock, out int frames)
    {
      var v = new MixerService.Voice(1, new MixerService.BufferSource(pcm), 1.0, fx);
      var outList = new List<float>(pcm.Length * 2);
      var acc = new float[960];
      int block = 0;
      while (!v.Done && block < 6000)
      {
        perBlock?.Invoke(v, block);
        Array.Clear(acc);
        v.Process(acc, 480, out _);
        outList.AddRange(acc);
        block++;
      }
      frames = outList.Count / 2;
      return outList.ToArray();
    }

    /// <summary>Frames until the last non-silent sample.</summary>
    private static int RenderLength(short[] pcm, SoundEffect fx)
    {
      var o = Render(pcm, fx, null, out _);
      int last = 0;
      for (int i = 0; i < o.Length; i += 2) if (Math.Abs(o[i]) > 1e-4) last = i / 2;
      return last + 1;
    }

    private static double Bench(int voices, bool withFx)
    {
      var fxs = new[] { SoundEffect.Reverb, SoundEffect.Echo, SoundEffect.Telephone, SoundEffect.PitchUp, SoundEffect.PitchDown, SoundEffect.Reverse, SoundEffect.None };
      var pcm = NoiseStereoShort(12 * R);
      var list = new List<MixerService.Voice>();
      for (int i = 0; i < voices; i++)
      {
        var v = new MixerService.Voice(i + 1, new MixerService.BufferSource(pcm), 0.3, withFx ? fxs[i % fxs.Length] : SoundEffect.None);
        if (withFx) v.SetLive(1.2, i % 2 == 0 ? -0.4 : 0.4, 0.5);
        list.Add(v);
      }
      var lim = new Limiter();
      var acc = new float[960];
      int blocks = 1000; // 10 s
      var sw = Stopwatch.StartNew();
      for (int b = 0; b < blocks; b++)
      {
        Array.Clear(acc);
        foreach (var v in list) v.Process(acc, 480, out _);
        lim.Process(acc, 480);
      }
      sw.Stop();
      // wall time of a single thread = CPU of one core (TotalProcessorTime includes other threads)
      return Math.Round(sw.Elapsed.TotalSeconds / (blocks * 0.01) * 100, 2);
    }
  }
}
