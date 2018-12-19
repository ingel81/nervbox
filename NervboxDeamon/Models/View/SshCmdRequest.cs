using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace NervboxDeamon.Models.View
{
  public class SshCmdRequest
  {
    public string Command { get; set; }
    public int TimeoutMs { get; set; } = 0;
  }
}
