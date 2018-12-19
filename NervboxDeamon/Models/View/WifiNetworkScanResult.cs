using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace NervboxDeamon.Models.View
{
  public class WifiNetworkScanResult
  {
    public string Mac { get; set; }
    public string Essid { get; set; }
    public double Frequency { get; set; }
    public int Channel { get; set; }
    public double Quality { get; set; }
    public double Level { get; set; }
    public bool Encryption { get; set; }
  }
}
