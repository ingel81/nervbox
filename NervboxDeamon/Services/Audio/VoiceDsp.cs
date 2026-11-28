using System;

namespace NervboxDeamon.Services.Audio
{
  /// <summary>One-click effects of the pad menu ("Mit Effekt abspielen").</summary>
  public enum SoundEffect
  {
    None,
    PitchUp,
    PitchDown,
    Reverse,
    Echo,
    Reverb,
    Telephone
  }

  /// <summary>
  /// DSP parameters shared with the browser engine (nervbox-player/src/app/core/audio/sound-fx.ts).
  /// Change both files together - Browser and Local playback must sound the same.
  /// </summary>
  public static class FxParams
  {
    public const int Rate = 48000;

    public const double PitchUpRate = 1.5;   // "Mickey": resample = pitch + speed
    public const double PitchDownRate = 0.7; // "Monster"

    public const double EchoDelaySec = 0.32;
    public const double EchoFeedback = 0.45;
    public const double EchoWet = 0.55;
    public const double EchoTailSec = 3.0;

    // Schroeder/Freeverb-lite: mono send -> 4 parallel damped combs -> 2 series allpasses per side
    public static readonly int[] CombDelays = { 1215, 1293, 1390, 1476 }; // samples @ 48 kHz
    public const double CombFeedback = 0.84;
    public const double CombDamp = 0.2;
    public static readonly int[] AllpassDelaysL = { 605, 480 };
    public static readonly int[] AllpassDelaysR = { 630, 505 };
    public const double AllpassFeedback = 0.5;
    public const double ReverbInputGain = 0.18;
    public const double ReverbWet = 0.4;
    public const double ReverbDry = 0.9;
    public const double ReverbTailSec = 2.5;

    public const double PhoneLowHz = 300;   // high-pass
    public const double PhoneHighHz = 3400; // low-pass
    public const double PhoneGain = 1.4;    // the band-pass removes a lot of energy

    // Live control (press + drag on a pad)
    public const double LiveRateMin = 0.5;
    public const double LiveRateMax = 2.0;
    public const double LiveLowpassMinHz = 300;   // filter = -1
    public const double LiveLowpassMaxHz = 20000; // filter -> 0-
    public const double LiveHighpassMinHz = 20;   // filter -> 0+
    public const double LiveHighpassMaxHz = 3000; // filter = +1
    public const double TremoloHz = 6.0;
    public const double SmoothingSec = 0.03;      // one-pole glide of all live params (no zipper noise)

    /// <summary>Butterworth Q (linear). Web Audio takes LP/HP Q in dB: 20*log10(0.7071) = -3.01 dB.</summary>
    public const double ButterworthQ = 0.70710678;

    public static double EffectRate(SoundEffect fx) => fx switch
    {
      SoundEffect.PitchUp => PitchUpRate,
      SoundEffect.PitchDown => PitchDownRate,
      _ => 1.0
    };

    public static double TailSec(SoundEffect fx) => fx switch
    {
      SoundEffect.Echo => EchoTailSec,
      SoundEffect.Reverb => ReverbTailSec,
      _ => 0
    };

    /// <summary>
    /// Live filter position (-1 = dark … 0 = open … +1 = thin) to the cutoffs of the two biquads that
    /// always run in series (low-pass, then high-pass). No filter-type switching = no transients.
    /// </summary>
    public static (double lowpassHz, double highpassHz) LiveFilter(double f)
    {
      f = Math.Clamp(f, -1, 1);
      if (f < 0) return (LiveLowpassMaxHz * Math.Pow(LiveLowpassMinHz / LiveLowpassMaxHz, -f), LiveHighpassMinHz);
      return (LiveLowpassMaxHz, LiveHighpassMinHz * Math.Pow(LiveHighpassMaxHz / LiveHighpassMinHz, f));
    }

    public static SoundEffect Parse(string name)
    {
      switch ((name ?? "").Trim().ToLowerInvariant())
      {
        case "pitch-up": case "pitchup": case "mickey": return SoundEffect.PitchUp;
        case "pitch-down": case "pitchdown": case "monster": return SoundEffect.PitchDown;
        case "reverse": case "rueckwaerts": return SoundEffect.Reverse;
        case "echo": return SoundEffect.Echo;
        case "reverb": case "hall": return SoundEffect.Reverb;
        case "telephone": case "phone": case "telefon": return SoundEffect.Telephone;
        default: return SoundEffect.None;
      }
    }

    public static string Name(SoundEffect fx) => fx switch
    {
      SoundEffect.PitchUp => "pitch-up",
      SoundEffect.PitchDown => "pitch-down",
      SoundEffect.Reverse => "reverse",
      SoundEffect.Echo => "echo",
      SoundEffect.Reverb => "reverb",
      SoundEffect.Telephone => "telephone",
      _ => null
    };
  }

  /// <summary>
  /// RBJ-cookbook biquad (same formulas as the Web Audio BiquadFilterNode), stereo, Direct Form I:
  /// the state is the real signal history, so coefficients can change while it runs (live sweeps)
  /// without the transients a transposed form produces.
  /// </summary>
  public sealed class Biquad
  {
    private float _b0 = 1, _b1, _b2, _a1, _a2;
    private float _x1L, _x2L, _y1L, _y2L, _x1R, _x2R, _y1R, _y2R;

    public void SetLowpass(double hz, double q = FxParams.ButterworthQ) => Set(false, hz, q);
    public void SetHighpass(double hz, double q = FxParams.ButterworthQ) => Set(true, hz, q);

    public void Set(bool highpass, double hz, double q = FxParams.ButterworthQ)
    {
      hz = Math.Clamp(hz, 10, FxParams.Rate * 0.49);
      double w0 = 2 * Math.PI * hz / FxParams.Rate;
      double cos = Math.Cos(w0), alpha = Math.Sin(w0) / (2 * q);
      double a0 = 1 + alpha;
      double b0, b1;
      if (highpass) { b0 = (1 + cos) / 2; b1 = -(1 + cos); }
      else { b0 = (1 - cos) / 2; b1 = 1 - cos; }
      _b0 = (float)(b0 / a0);
      _b1 = (float)(b1 / a0);
      _b2 = _b0;
      _a1 = (float)(-2 * cos / a0);
      _a2 = (float)((1 - alpha) / a0);
    }

    /// <summary>
    /// Start a filter in the middle of a running signal without a click: history = current sample.
    /// Exact for low-pass (DC gain 1) and ~exact for a low high-pass cutoff (-a1-a2 ≈ 1).
    /// </summary>
    public void Prime(float l, float r)
    {
      _x1L = _x2L = _y1L = _y2L = l;
      _x1R = _x2R = _y1R = _y2R = r;
    }

    /// <summary>Process interleaved stereo in place.</summary>
    public void Process(float[] buf, int frames) => Process(buf, 0, frames);

    public void Process(float[] buf, int startFrame, int frames)
    {
      float b0 = _b0, b1 = _b1, b2 = _b2, a1 = _a1, a2 = _a2;
      float x1L = _x1L, x2L = _x2L, y1L = _y1L, y2L = _y2L, x1R = _x1R, x2R = _x2R, y1R = _y1R, y2R = _y2R;
      for (int i = startFrame * 2, n = (startFrame + frames) * 2; i < n; i += 2)
      {
        float x = buf[i];
        float y = b0 * x + b1 * x1L + b2 * x2L - a1 * y1L - a2 * y2L;
        x2L = x1L; x1L = x; y2L = y1L; y1L = y;
        buf[i] = y;

        x = buf[i + 1];
        y = b0 * x + b1 * x1R + b2 * x2R - a1 * y1R - a2 * y2R;
        x2R = x1R; x1R = x; y2R = y1R; y1R = y;
        buf[i + 1] = y;
      }
      _x1L = x1L; _x2L = x2L; _x1R = x1R; _x2R = x2R;
      // flush denormals
      _y1L = Math.Abs(y1L) < 1e-15f ? 0 : y1L; _y2L = Math.Abs(y2L) < 1e-15f ? 0 : y2L;
      _y1R = Math.Abs(y1R) < 1e-15f ? 0 : y1R; _y2R = Math.Abs(y2R) < 1e-15f ? 0 : y2R;
    }
  }

  /// <summary>Feedback delay: out = x + wet*d, line = x + feedback*d (Web Audio: DelayNode + feedback GainNode).</summary>
  public sealed class EchoFx
  {
    private readonly float[] _l, _r;
    private int _idx;

    public EchoFx()
    {
      int n = (int)Math.Round(FxParams.EchoDelaySec * FxParams.Rate);
      _l = new float[n];
      _r = new float[n];
    }

    public void Process(float[] buf, int frames)
    {
      const float fb = (float)FxParams.EchoFeedback, wet = (float)FxParams.EchoWet;
      int n = _l.Length, idx = _idx;
      for (int i = 0; i < frames; i++)
      {
        float xl = buf[2 * i], xr = buf[2 * i + 1];
        float dl = _l[idx], dr = _r[idx];
        _l[idx] = xl + fb * dl;
        _r[idx] = xr + fb * dr;
        buf[2 * i] = xl + wet * dl;
        buf[2 * i + 1] = xr + wet * dr;
        if (++idx == n) idx = 0;
      }
      _idx = idx;
    }
  }

  /// <summary>
  /// Schroeder/Freeverb-lite reverb. The browser engine renders the impulse response of exactly this
  /// structure into a ConvolverNode (sound-fx.ts: renderReverbImpulse), so both sound identical.
  /// </summary>
  public sealed class ReverbFx
  {
    private readonly float[][] _comb;
    private readonly int[] _combIdx;
    private readonly float[] _combStore;
    private readonly float[][] _apL, _apR;
    private readonly int[] _apIdxL, _apIdxR;

    public ReverbFx()
    {
      _comb = Array.ConvertAll(FxParams.CombDelays, d => new float[d]);
      _combIdx = new int[_comb.Length];
      _combStore = new float[_comb.Length];
      _apL = Array.ConvertAll(FxParams.AllpassDelaysL, d => new float[d]);
      _apR = Array.ConvertAll(FxParams.AllpassDelaysR, d => new float[d]);
      _apIdxL = new int[_apL.Length];
      _apIdxR = new int[_apR.Length];
    }

    /// <summary>Wet signal for one mono input sample (already scaled by ReverbInputGain).</summary>
    public void Tick(float m, out float wl, out float wr)
    {
      const float fb = (float)FxParams.CombFeedback, damp = (float)FxParams.CombDamp, apfb = (float)FxParams.AllpassFeedback;
      float sum = 0;
      for (int c = 0; c < _comb.Length; c++)
      {
        var b = _comb[c];
        int i = _combIdx[c];
        float o = b[i];
        float st = o * (1 - damp) + _combStore[c] * damp;
        _combStore[c] = st;
        b[i] = m + st * fb;
        if (++i == b.Length) i = 0;
        _combIdx[c] = i;
        sum += o;
      }
      wl = Allpass(_apL, _apIdxL, sum, apfb);
      wr = Allpass(_apR, _apIdxR, sum, apfb);
    }

    private static float Allpass(float[][] bufs, int[] idx, float x, float g)
    {
      for (int a = 0; a < bufs.Length; a++)
      {
        var b = bufs[a];
        int i = idx[a];
        float bo = b[i];
        float y = -x + bo;
        b[i] = x + bo * g;
        if (++i == b.Length) i = 0;
        idx[a] = i;
        x = y;
      }
      return x;
    }

    public void Process(float[] buf, int frames)
    {
      const float inGain = (float)(FxParams.ReverbInputGain * 0.5), wet = (float)FxParams.ReverbWet, dry = (float)FxParams.ReverbDry;
      for (int i = 0; i < frames; i++)
      {
        float l = buf[2 * i], r = buf[2 * i + 1];
        Tick((l + r) * inGain, out var wl, out var wr);
        buf[2 * i] = dry * l + wet * wl;
        buf[2 * i + 1] = dry * r + wet * wr;
      }
      // flush denormals in the damping state
      for (int c = 0; c < _combStore.Length; c++) if (Math.Abs(_combStore[c]) < 1e-15f) _combStore[c] = 0;
    }
  }

  /// <summary>
  /// Master-bus peak limiter: instant-ish attack (1 ms), 150 ms release, ceiling -1 dBFS, plus a soft
  /// clipper above 0.9 that catches the attack overshoot. Many voices get quieter instead of hard-clipping.
  /// </summary>
  public sealed class Limiter
  {
    public const float Threshold = 0.89f; // -1 dBFS
    private static readonly float AttackCoef = (float)(1 - Math.Exp(-1.0 / (0.001 * FxParams.Rate)));
    private static readonly float ReleaseCoef = (float)(1 - Math.Exp(-1.0 / (0.150 * FxParams.Rate)));
    private float _gain = 1;
    public long SoftClipped;

    public float Gain => _gain;

    public void Process(float[] buf, int frames)
    {
      float g = _gain;
      for (int i = 0; i < frames; i++)
      {
        float l = buf[2 * i], r = buf[2 * i + 1];
        float peak = Math.Max(Math.Abs(l), Math.Abs(r));
        float want = peak > Threshold ? Threshold / peak : 1f;
        g += (want - g) * (want < g ? AttackCoef : ReleaseCoef);
        buf[2 * i] = SoftClip(l * g);
        buf[2 * i + 1] = SoftClip(r * g);
      }
      _gain = g;
    }

    private float SoftClip(float x)
    {
      float a = Math.Abs(x);
      if (a <= 0.9f) return x;
      SoftClipped++;
      float y = 0.9f + 0.1f * MathF.Tanh((a - 0.9f) / 0.1f); // asymptote 1.0, continuous slope 1 at 0.9
      return x < 0 ? -y : y;
    }
  }
}
