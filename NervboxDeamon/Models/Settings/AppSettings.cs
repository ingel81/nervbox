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
    public string SerialPort { get; set; }
    public string SerialDebug { get; set; }
    public SSHSettings SSH { get; set; }
  }

  public class SSHSettings
  {
    public bool Enabled { get; set; }
    public string Host { get; set; }
    public int Port { get; set; }
  }

  public class SocketAPISettings
  {
    public bool Enabled { get; set; }
  }

}
