using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace NervboxDeamon.Models.Settings
{

  public class AppSettings
  {
    public string Secret { get; set; }
    public string LogPath { get; set; }
    public string DatabasePath { get; set; } = "nervbox.db";
    public string SoundPath { get; set; }
    public string SoundPathDebugPlay { get; set; }
    public string LocalPlayer { get; set; } = "mpg123";
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
