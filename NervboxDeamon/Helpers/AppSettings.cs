using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace NervboxDeamon.Helpers
{

  public class AppSettings
  {
    public string Secret { get; set; }
    public string LogPath { get; set; }
    public SSHSettings SSH { get; set; }
  }

  public class SSHSettings
  {
    public string Host { get; set; }
    public int Port { get; set; }
  }
}
