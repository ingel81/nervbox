using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using NervboxDeamon.DbModels;
using Microsoft.Extensions.DependencyInjection;
using Newtonsoft.Json;
using NervboxDeamon.Models.Settings;

namespace NervboxDeamon.Services
{
  public interface ISettingsService
  {
    void CheckSettingConsistency();
  }

  public class SettingsService : ISettingsService
  {
    private List<Setting> defaultSettings = new List<Setting>();
    private Dictionary<string, Setting> Settings = new Dictionary<string, Setting>();

    private readonly IServiceProvider serviceProvider;

    public SettingsService(IServiceProvider serviceProvider)
    {
      this.serviceProvider = serviceProvider;
      this.RegisterDefaultSettings();
    }

    private void RegisterDefaultSettings()
    {
      //Testing
      defaultSettings.Add(new Setting() { Key = "example1string", SettingScope = SettingScope.None, SettingType = SettingType.String, Description = "1 a default string setting", Value = "DefaultString" });
      defaultSettings.Add(new Setting() { Key = "example2boolean", SettingScope = SettingScope.None, SettingType = SettingType.Boolean, Description = "1 a default boolean setting", Value = "true" });
      defaultSettings.Add(new Setting() { Key = "example3double", SettingScope = SettingScope.None, SettingType = SettingType.Double, Description = "1 a default double setting", Value = "42.47" });
      defaultSettings.Add(new Setting() { Key = "example4int", SettingScope = SettingScope.None, SettingType = SettingType.Int, Description = "1 a default int setting", Value = "666" });
      defaultSettings.Add(new Setting() { Key = "example5json", SettingScope = SettingScope.None, SettingType = SettingType.JSON, Description = "1 a default json setting", Value = "{ \"affe\": \"haha\"}" });

      //network
      defaultSettings.Add(new Setting()
      {
        Key = "networkConfig",
        SettingScope = SettingScope.Network,
        SettingType = SettingType.JSON,
        Description = "Network Settings",
        Value = JsonConvert.SerializeObject(new NetworkSettings
        {
          LanMode = LanMode.On,
          LanSettings = new LanSettings()
          {
            Dhcp = false,
            Ip = "192.168.0.100",
            Gateway = "192.168.0.1",
            SubnetMask = "255.255.255.0",
            Dns0 = "192.168.0.1",
            Dns1 = "192.168.0.1"
          },

          WifiMode = WifiMode.Off,
          WifiSettings = new WifiSettings()
          {
            Dhcp = false,
            Ip = "192.168.0.100",
            Gateway = "192.168.0.1",
            SubnetMask = "255.255.255.0",
            Dns0 = "192.168.0.1",
            Dns1 = "192.168.0.1",
            SSID = "",
            PSK = ""
          },
          AccessPointSettings = new AccessPointSettings()
          {
            Dhcp = true,
            Ip = "192.168.0.1",
            Gateway = "", //not used
            SubnetMask = "255.255.255.0",
            Dns0 = "", //not used
            Dns1 = "", //not used
            SSID = "nervbox",
            PSK = "nervbox",
            Channel = 1,
            LeaseHours = 24 * 7,
            RangeStart = "192.168.0.100",
            RangeEnd = "192.168.0.120"
          }
        })
      });

    }

    public void CheckSettingConsistency()
    {
      using (var scope = serviceProvider.CreateScope())
      {
        bool settingsChanged = false;

        var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();
        var existing = db.Settings.ToList();

        var validSettings = existing.Where(a => defaultSettings.Exists(d => d.Key.Equals(a.Key) && d.SettingType == a.SettingType)).ToList();
        var invalidSettings = existing.Where(a => !(defaultSettings.Exists(d => d.Key.Equals(a.Key) && d.SettingType == a.SettingType))).ToList();
        var newSettings = defaultSettings.Where(d => !existing.Exists(a => a.Key.Equals(d.Key) && d.SettingType == a.SettingType)).ToList();

        // 1) delete invalid or removed settings
        foreach (var invalidSet in invalidSettings)
        {
          settingsChanged = true;
          db.Settings.Remove(invalidSet);
        }

        // 2) neue Settings mit defaults anlegen
        foreach (var newSet in newSettings)
        {
          settingsChanged = true;
          db.Settings.Add(new Setting() { Key = newSet.Key, SettingScope = newSet.SettingScope, SettingType = newSet.SettingType, Description = newSet.Description, Value = newSet.Value });
        }

        // 3) für die validen settings die beschreibung updaten, falls geändert
        foreach (var set in validSettings)
        {
          var df = defaultSettings.Where(a => a.Key.Equals(set.Key)).FirstOrDefault();

          if (!df.Description.Equals(set.Description))
          {
            settingsChanged = true;
            set.Description = df.Description;
          }

          if (!(df.SettingScope == set.SettingScope))
          {
            settingsChanged = true;
            set.SettingScope = df.SettingScope;
          }

        }

        if (settingsChanged)
        {
          db.SaveChanges();
        }

        //load all
        this.Settings = db.Settings.ToDictionary(s => s.Key, s => s);

      }
    }
  }
}
