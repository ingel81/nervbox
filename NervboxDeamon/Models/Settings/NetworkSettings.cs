using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace NervboxDeamon.Models.Settings
{
  public enum LanMode { On, Off }
  public enum WifiMode { Off, Client, AccessPoint }

  public class NetworkSettings
  {
    public LanMode LanMode { get; set; }
    public LanSettings LanSettings { get; set; }

    public WifiMode WifiMode { get; set; }
    public WifiSettings WifiSettings { get; set; }
    public AccessPointSettings AccessPointSettings { get; set; }
    public NtpSettings NtpSettings { get; set; }
  }

  public class LanSettings
  {
    public bool Dhcp { get; set; }
    public string Ip { get; set; }
    public string SubnetMask { get; set; }
    public string Gateway { get; set; }
    public string Dns0 { get; set; }
    public string Dns1 { get; set; }
  }

  public class WifiSettings : LanSettings
  {
    public string SSID { get; set; }
    public string PSK { get; set; }
  }

  public class AccessPointSettings : LanSettings
  {
    public string SSID { get; set; }
    public string PSK { get; set; }
    public string RangeStart { get; set; }
    public string RangeEnd { get; set; }
    public int LeaseHours { get; set; }
    public int Channel { get; set; }
  }

  public class NtpSettings
  {
    public string Ntp { get; set; }
  }

}
