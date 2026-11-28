using System;
using System.IO;

namespace NervboxDeamon.Services.Audio
{
  /// <summary>
  /// Minimal RIFF/WAVE reader for the mixer (TTS output of Piper is 16-bit mono 22.05 kHz).
  /// Supports PCM 8/16/24/32-bit int and 32-bit float, 1–8 channels (first two used), any sample rate;
  /// converts to interleaved stereo int16 @ 48 kHz with linear interpolation.
  /// </summary>
  public static class WavReader
  {
    public static short[] DecodeFile(string path, int maxSeconds = 600) => Decode(File.ReadAllBytes(path), maxSeconds);

    public static short[] Decode(byte[] wav, int maxSeconds = 600)
    {
      if (wav.Length < 12 || ReadTag(wav, 0) != "RIFF" || ReadTag(wav, 8) != "WAVE")
        throw new InvalidDataException("not a RIFF/WAVE file");

      int format = 0, channels = 0, rate = 0, bits = 0;
      int dataOff = -1, dataLen = 0;
      int p = 12;
      while (p + 8 <= wav.Length)
      {
        string id = ReadTag(wav, p);
        int len = BitConverter.ToInt32(wav, p + 4);
        int body = p + 8;
        if (id == "fmt " && len >= 16)
        {
          format = BitConverter.ToUInt16(wav, body);
          channels = BitConverter.ToUInt16(wav, body + 2);
          rate = BitConverter.ToInt32(wav, body + 4);
          bits = BitConverter.ToUInt16(wav, body + 14);
          if (format == 0xFFFE && len >= 26) format = BitConverter.ToUInt16(wav, body + 24); // WAVE_FORMAT_EXTENSIBLE
        }
        else if (id == "data")
        {
          dataOff = body;
          // streamed WAVs (e.g. piped from a synthesizer) may carry 0 / 0xFFFFFFFF as size
          dataLen = len <= 0 || body + (long)len > wav.Length ? wav.Length - body : len;
          break;
        }
        if (len < 0) break;
        p = body + len + (len & 1);
      }
      if (dataOff < 0 || channels < 1 || rate < 1000) throw new InvalidDataException("WAV without fmt/data chunk");
      bool isFloat = format == 3;
      if (!(format == 1 || isFloat)) throw new InvalidDataException($"unsupported WAV format {format}");
      if (isFloat && bits != 32) throw new InvalidDataException("only 32-bit float WAV supported");
      if (!isFloat && bits != 8 && bits != 16 && bits != 24 && bits != 32) throw new InvalidDataException($"unsupported bit depth {bits}");

      int bps = bits / 8, frameBytes = bps * channels;
      int inFrames = Math.Min(dataLen / frameBytes, maxSeconds * rate);
      var left = new float[inFrames];
      var right = new float[inFrames];
      for (int f = 0; f < inFrames; f++)
      {
        int o = dataOff + f * frameBytes;
        left[f] = Sample(wav, o, bits, isFloat);
        right[f] = channels > 1 ? Sample(wav, o + bps, bits, isFloat) : left[f];
      }
      return ResampleToStereo48k(left, right, rate);
    }

    /// <summary>Linear-interpolation resampler to interleaved stereo int16 @ 48 kHz.</summary>
    public static short[] ResampleToStereo48k(float[] left, float[] right, int rate)
    {
      int inFrames = left.Length;
      if (inFrames == 0) return Array.Empty<short>();
      double step = (double)rate / FxParams.Rate;
      int outFrames = rate == FxParams.Rate ? inFrames : (int)Math.Floor((inFrames - 1) / step) + 1;
      var outBuf = new short[outFrames * 2];
      for (int i = 0; i < outFrames; i++)
      {
        double pos = i * step;
        int i0 = (int)pos;
        float frac = (float)(pos - i0);
        int i1 = Math.Min(i0 + 1, inFrames - 1);
        outBuf[2 * i] = ToShort(left[i0] + (left[i1] - left[i0]) * frac);
        outBuf[2 * i + 1] = ToShort(right[i0] + (right[i1] - right[i0]) * frac);
      }
      return outBuf;
    }

    private static short ToShort(float v)
    {
      int s = (int)MathF.Round(v * 32767f);
      return (short)Math.Clamp(s, short.MinValue, short.MaxValue);
    }

    private static float Sample(byte[] b, int o, int bits, bool isFloat)
    {
      if (isFloat) return BitConverter.ToSingle(b, o);
      return bits switch
      {
        8 => (b[o] - 128) / 128f,
        16 => BitConverter.ToInt16(b, o) / 32768f,
        24 => ((b[o] | (b[o + 1] << 8) | ((sbyte)b[o + 2] << 16))) / 8388608f,
        _ => BitConverter.ToInt32(b, o) / 2147483648f
      };
    }

    private static string ReadTag(byte[] b, int o) => System.Text.Encoding.ASCII.GetString(b, o, 4);

    /// <summary>16-bit PCM WAV writer (used by the DSP self test).</summary>
    public static byte[] Encode16(short[] interleaved, int channels, int rate)
    {
      int dataLen = interleaved.Length * 2;
      using var ms = new MemoryStream(44 + dataLen);
      using var w = new BinaryWriter(ms);
      w.Write("RIFF"u8.ToArray()); w.Write(36 + dataLen); w.Write("WAVE"u8.ToArray());
      w.Write("fmt "u8.ToArray()); w.Write(16); w.Write((short)1); w.Write((short)channels);
      w.Write(rate); w.Write(rate * channels * 2); w.Write((short)(channels * 2)); w.Write((short)16);
      w.Write("data"u8.ToArray()); w.Write(dataLen);
      foreach (var s in interleaved) w.Write(s);
      w.Flush();
      return ms.ToArray();
    }
  }
}
