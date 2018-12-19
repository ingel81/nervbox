using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Threading.Tasks;
using NervboxDeamon.Models.Settings;
using NervboxDeamon.Models.View;

namespace NervboxDeamon.Services
{
  public interface ISystemService
  {
    void Reboot();
    void ApplyNetworkConfig();
    List<WifiNetworkScanResult> ScanWifiNetworks(string wifiDeviceName);    
  }

  public class SystemService : ISystemService
  {
    //injected
    private readonly ILogger<ISystemService> Logger;
    private readonly IConfiguration Configuration;
    private readonly IServiceProvider ServiceProvider;
    private readonly IHostingEnvironment HostingEnvironment;
    private readonly ISshService SSHService;

    //member

    public SystemService(
      ILogger<ISystemService> logger,
      IConfiguration configuration,
      IServiceProvider serviceProvider,
      IHostingEnvironment hostingEnvironment,
      ISshService sshService
      )
    {
      this.Logger = logger;
      this.Configuration = configuration;
      this.ServiceProvider = serviceProvider;
      this.HostingEnvironment = hostingEnvironment;
      this.SSHService = sshService;
    }

    public void ApplyNetworkConfig()
    {
      NetworkSettings settings = null;

      using (var scope = this.ServiceProvider.CreateScope())
      {
        var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();
        var networkSetting = db.Settings.Find("networkConfig");
        settings = JsonConvert.DeserializeObject<NetworkSettings>(networkSetting.Value);
      }

      if (settings == null)
      {
        throw new Exception($"NetworkConfig not found");
      }

      //read templates
      string dhcpcd = System.IO.File.ReadAllText(Path.Combine(this.HostingEnvironment.ContentRootPath, "docs", "configTemplates", "dhcpcd.conf.template"));
      string wpa_supplicant = System.IO.File.ReadAllText(Path.Combine(this.HostingEnvironment.ContentRootPath, "docs", "configTemplates", "wpa_supplicant.conf.template"));
      string dnsmasq = System.IO.File.ReadAllText(Path.Combine(this.HostingEnvironment.ContentRootPath, "docs", "configTemplates", "dnsmasq.conf.template"));
      string hostapd = System.IO.File.ReadAllText(Path.Combine(this.HostingEnvironment.ContentRootPath, "docs", "configTemplates", "hostapd.conf.template"));

      if (settings.LanMode == LanMode.On)
      {
        if (settings.LanSettings.Dhcp)
        {
          //default, do nothing
        }
        else
        {
          //uncomment static ip area
          var dhcpcdLines = dhcpcd.Split("\n", StringSplitOptions.None).ToList();
          int startIndex = dhcpcdLines.IndexOf("#nervboxtemplate_start_eth0_static");
          int endIndex = dhcpcdLines.IndexOf("#nervboxtemplate_end_eth0_static");

          byte[] maskBytes = IPAddress.Parse(settings.LanSettings.SubnetMask).GetAddressBytes();
          int cidr = MaskToCIDR(maskBytes);

          for (int i = startIndex + 1; i < endIndex; i++)
          {
            dhcpcdLines[i] = dhcpcdLines[i].Replace("#", "")
                               .Replace("{IP}", settings.LanSettings.Ip)
                               .Replace("{MASK}", cidr.ToString())
                               .Replace("{GATEWAY}", settings.LanSettings.Gateway)
                               .Replace("{DNS1}", settings.LanSettings.Dns0)
                               .Replace("{DNS2}", settings.LanSettings.Dns1);
          }

          dhcpcd = string.Join("\n", dhcpcdLines);
        }
      }
      else
      {
        //TODO: kein lan?
      }

      if (settings.WifiMode == WifiMode.Off)
      {

      }
      else if (settings.WifiMode == WifiMode.Client)
      {
        //wifi credentials
        var wpaSupplicantLines = wpa_supplicant.Split("\n", StringSplitOptions.None).ToList();
        int wpaStartIndex = wpaSupplicantLines.IndexOf("#nervboxtemplate_start_wifi_credentials");
        int wpaEndIndex = wpaSupplicantLines.IndexOf("#nervboxtemplate_end_wifi_credentials");

        for (int i = wpaStartIndex + 1; i < wpaEndIndex; i++)
        {
          wpaSupplicantLines[i] = wpaSupplicantLines[i].Replace("#", "")
                             .Replace("{SSID}", settings.WifiSettings.SSID)
                             .Replace("{PSK}", settings.WifiSettings.PSK);
        }

        wpa_supplicant = string.Join("\n", wpaSupplicantLines);

        if (settings.WifiSettings.Dhcp == false)
        {
          var wifiLines = dhcpcd.Split("\n", StringSplitOptions.None).ToList();
          int wifiStartIndex = wifiLines.IndexOf("#nervboxtemplate_start_wlan0_static");
          int wifiEndIndex = wifiLines.IndexOf("#nervboxtemplate_end_wlan0_static");

          byte[] maskBytes = IPAddress.Parse(settings.WifiSettings.SubnetMask).GetAddressBytes();
          int cidr = MaskToCIDR(maskBytes);

          for (int i = wifiStartIndex + 1; i < wifiEndIndex; i++)
          {
            wifiLines[i] = wifiLines[i].Replace("#", "")
                               .Replace("{IP}", settings.WifiSettings.Ip)
                               .Replace("{MASK}", cidr.ToString())
                               .Replace("{GATEWAY}", settings.WifiSettings.Gateway)
                               .Replace("{DNS1}", settings.WifiSettings.Dns0)
                               .Replace("{DNS2}", settings.WifiSettings.Dns1);
          }

          dhcpcd = string.Join("\n", wifiLines);
        }
      }
      else if (settings.WifiMode == WifiMode.AccessPoint)
      {
        {
          //ap mode: static ip config
          var apLines = dhcpcd.Split("\n", StringSplitOptions.None).ToList();
          int apStartIndex = apLines.IndexOf("#nervboxtemplate_start_wlan0_ap");
          int apEndIndex = apLines.IndexOf("#nervboxtemplate_end_wlan0_ap");

          byte[] maskBytes = IPAddress.Parse(settings.AccessPointSettings.SubnetMask).GetAddressBytes();
          int cidr = MaskToCIDR(maskBytes);

          for (int i = apStartIndex + 1; i < apEndIndex; i++)
          {
            apLines[i] = apLines[i].Replace("#", "")
                               .Replace("{IP}", settings.AccessPointSettings.Ip)
                               .Replace("{MASK}", cidr.ToString());
          }

          dhcpcd = string.Join("\n", apLines);
        }

        {
          //ap mode: dnsmasq config
          var dnsLines = dnsmasq.Split("\n", StringSplitOptions.None).ToList();
          int apStartIndex = dnsLines.IndexOf("#nervboxtemplate_start_wlan0_ap");
          int apEndIndex = dnsLines.IndexOf("#nervboxtemplate_end_wlan0_ap");

          for (int i = apStartIndex + 1; i < apEndIndex; i++)
          {
            dnsLines[i] = dnsLines[i].Replace("#", "")
                               .Replace("{RANGESTART}", settings.AccessPointSettings.RangeStart)
                               .Replace("{RANGEEND}", settings.AccessPointSettings.RangeEnd)
                               .Replace("{MASK}", settings.AccessPointSettings.SubnetMask)
                               .Replace("{LEASEHOURS}", settings.AccessPointSettings.LeaseHours.ToString());
          }

          dnsmasq = string.Join("\n", dnsLines);
        }

        {
          //ap mode: hostapd config
          var hostapdLines = hostapd.Split("\n", StringSplitOptions.None).ToList();
          int apStartIndex = hostapdLines.IndexOf("#nervboxtemplate_start_wlan0_ap");
          int apEndIndex = hostapdLines.IndexOf("#nervboxtemplate_end_wlan0_ap");

          for (int i = apStartIndex + 1; i < apEndIndex; i++)
          {
            hostapdLines[i] = hostapdLines[i].Replace("#", "")
                               .Replace("{SSID}", settings.AccessPointSettings.SSID)
                               .Replace("{CHANNEL}", settings.AccessPointSettings.Channel.ToString())
                               .Replace("{PSK}", settings.AccessPointSettings.PSK);
          }

          hostapd = string.Join("\n", hostapdLines);
        }

      }

      //create newConfig path
      string newConfigPath = Path.Combine(this.HostingEnvironment.ContentRootPath, "docs", "newConfig");
      var di = new DirectoryInfo(newConfigPath);
      if (di.Exists)
      {
        di.Delete(true);
      }

      di.Create();

      //write all files
      System.IO.File.WriteAllText(Path.Combine(newConfigPath, "dhcpcd.conf"), dhcpcd);
      System.IO.File.WriteAllText(Path.Combine(newConfigPath, "wpa_supplicant.conf"), wpa_supplicant);
      System.IO.File.WriteAllText(Path.Combine(newConfigPath, "dnsmasq.conf"), dnsmasq);
      System.IO.File.WriteAllText(Path.Combine(newConfigPath, "hostapd.conf"), hostapd);

      //copy dhcpcd.conf to target
      SSHService.SendCmd("sudo cp /home/pi/nervbox/docs/newConfig/dhcpcd.conf /etc/dhcpcd.conf");

      //copy wpa_supplicant.conf to target
      SSHService.SendCmd("sudo cp /home/pi/nervbox/docs/newConfig/wpa_supplicant.conf /etc/wpa_supplicant/wpa_supplicant.conf");

      //copy dnsmasq.conf to target
      SSHService.SendCmd("sudo cp /home/pi/nervbox/docs/newConfig/dnsmasq.conf /etc/dnsmasq.conf");

      //copy hostapd.conf to target
      SSHService.SendCmd("sudo cp /home/pi/nervbox/docs/newConfig/hostapd.conf /etc/hostapd/hostapd.conf");

      if (settings.WifiMode == WifiMode.AccessPoint)
      {
        SSHService.SendCmd("sudo systemctl enable dnsmasq");
        SSHService.SendCmd("sudo systemctl enable hostapd");

        SSHService.SendCmd("sudo systemctl start dnsmasq");
        SSHService.SendCmd("sudo systemctl start hostapd");
      }
      else
      {
        SSHService.SendCmd("sudo systemctl stop dnsmasq");
        SSHService.SendCmd("sudo systemctl disable dnsmasq");

        SSHService.SendCmd("sudo systemctl stop hostapd");
        SSHService.SendCmd("sudo systemctl disable hostapd");
      }

      SSHService.SendCmd("sudo reboot");
    }

    public List<WifiNetworkScanResult> ScanWifiNetworks(string wifiDeviceName)
    {
      List<WifiNetworkScanResult> results = new List<WifiNetworkScanResult>();

      int status = -1;
      string error = string.Empty;
      var response = SSHService.SendReadCmd($"sudo iwlist {wifiDeviceName} scan | bash /home/pi/nervbox/docs/scripts/iwlistscan.sh", out error, out status, 30000);
      var responseLines = response.Split("\n");

      for (int i = 1; i < responseLines.Length; i++)
      {
        if (string.IsNullOrWhiteSpace(responseLines[i]))
        {
          continue;
        }

        var lineParts = responseLines[i].Split("\t");
        var parts = lineParts[4].Split("/");
        var quality = double.Parse(parts[0]) / double.Parse(parts[1]);
        results.Add(new WifiNetworkScanResult()
        {

          Mac = lineParts[0],
          Essid = lineParts[1].Replace("\"", ""),
          Frequency = Double.Parse(lineParts[2]),
          Channel = int.Parse(lineParts[3]),
          Quality = quality,
          Level = Double.Parse(lineParts[5]),
          Encryption = lineParts[6].Equals("on") ? true : false
        });
      }


      return results;
      //TODO: parse;
    }

    public void Reboot()
    {
      this.SSHService.SendCmd("sudo reboot");
    }

    #region Helper

    static int MaskToCIDR(byte[] bytes)
    {

      var b0 = bytes[0];
      var b1 = bytes[1];
      var b2 = bytes[2];
      var b3 = bytes[3];

      return
          b3 != 0 ? (
              (b3 & 0x01) != 0 ? 32 :
              (b3 & 0x02) != 0 ? 31 :
              (b3 & 0x04) != 0 ? 30 :
              (b3 & 0x08) != 0 ? 29 :
              (b3 & 0x10) != 0 ? 28 :
              (b3 & 0x20) != 0 ? 27 :
              (b3 & 0x40) != 0 ? 26 :
                                 25) :
          b2 != 0 ? (
              (b2 & 0x01) != 0 ? 24 :
              (b2 & 0x02) != 0 ? 23 :
              (b2 & 0x04) != 0 ? 22 :
              (b2 & 0x08) != 0 ? 21 :
              (b2 & 0x10) != 0 ? 20 :
              (b2 & 0x20) != 0 ? 19 :
              (b2 & 0x40) != 0 ? 18 :
                                 17) :
          b1 != 0 ? (
              (b1 & 0x01) != 0 ? 16 :
              (b1 & 0x02) != 0 ? 15 :
              (b1 & 0x04) != 0 ? 14 :
              (b1 & 0x08) != 0 ? 13 :
              (b1 & 0x10) != 0 ? 12 :
              (b1 & 0x20) != 0 ? 11 :
              (b1 & 0x40) != 0 ? 10 :
                                 9) :
          b0 != 0 ? (
              (b0 & 0x01) != 0 ? 8 :
              (b0 & 0x02) != 0 ? 7 :
              (b0 & 0x04) != 0 ? 6 :
              (b0 & 0x08) != 0 ? 5 :
              (b0 & 0x10) != 0 ? 4 :
              (b0 & 0x20) != 0 ? 3 :
              (b0 & 0x40) != 0 ? 2 :
                                 1) :
                             0;
    }

    #endregion Helper

  }
}
