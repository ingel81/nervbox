using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace NervboxDeamon.Models.Settings
{
  /// <summary>
  /// Defines how sounds are played
  /// </summary>
  public enum PlaybackMode
  {
    /// <summary>
    /// Sound is played locally on the server (via mpg123, SSH, etc.)
    /// Used for Raspberry Pi deployment where the Pi has speakers
    /// </summary>
    Local,

    /// <summary>
    /// Sound is streamed to the browser for playback
    /// Used for Docker/Cloud deployment where there's no local audio output
    /// </summary>
    Browser
  }

  public class AppSettings
  {
    public string Secret { get; set; }
    public string LogPath { get; set; }
    public string DatabasePath { get; set; } = "nervbox.db";
    public string SoundPath { get; set; }
    public string SoundPathDebugPlay { get; set; }
    public string AvatarPath { get; set; } = "avatars";
    public string LocalPlayer { get; set; } = "mpg123";

    /// <summary>
    /// How sounds should be played: "Local" (server plays via speakers) or "Browser" (client streams)
    /// Default: Local (backward compatible with Raspberry Pi deployment)
    /// </summary>
    public PlaybackMode PlaybackMode { get; set; } = PlaybackMode.Local;

    /// <summary>
    /// Cesium Ion Access Token for 3D map features
    /// Get one at: https://cesium.com/ion/tokens
    /// </summary>
    public string CesiumAccessToken { get; set; } = "";

    public SSHSettings SSH { get; set; }
    public CameraSettings Camera1 { get; set; }
  }

  public class SSHSettings
  {
    public bool Enabled { get; set; }
    public string Host { get; set; }
    public int Port { get; set; }
    public string User { get; set; }
    public string Password { get; set; }
  }

  public class CameraSettings
  {
    public string Host { get; set; }
    public int Port { get; set; }
    public string User { get; set; }
    public string Password { get; set; }
  }

  public class GiphySettings
  {
    public string[] ApiKeys { get; set; } = Array.Empty<string>();
  }

}
