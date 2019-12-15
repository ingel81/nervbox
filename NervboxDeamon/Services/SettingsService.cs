using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using NervboxDeamon.DbModels;
using Microsoft.Extensions.DependencyInjection;
using Newtonsoft.Json;
using NervboxDeamon.Models.Settings;
using System.Globalization;

namespace NervboxDeamon.Services
{
  public interface ISettingsService
  {
    void CheckSettingConsistency();
    Setting GetSingleSettingByKey(string key);
    List<Setting> GetSettingsByScope(SettingScope scope);
    Task<Setting> UpdateSingleSetting(Setting updateSetting);
    Task<List<Setting>> UpdateMultipleSettings(List<Setting> updateSettings);
  }

  /// <summary>
  /// Verwaltung von Einstellungen jeder Art
  /// </summary>
  public class SettingsService : ISettingsService
  {
    private List<Setting> defaultSettings = new List<Setting>();
    private readonly object settingsLock = new object();
    private Dictionary<string, Setting> Settings = new Dictionary<string, Setting>();

    private readonly IServiceProvider serviceProvider;

    public SettingsService(IServiceProvider serviceProvider)
    {
      this.serviceProvider = serviceProvider;
      this.RegisterDefaultSettings();
    }

    #region public methods

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
        lock (settingsLock)
        {
          this.Settings = db.Settings.ToDictionary(s => s.Key, s => s);
        }
      }
    }

    public Setting GetSingleSettingByKey(string key)
    {
      lock (settingsLock)
      {
        return this.Settings.Where(s => s.Key.ToLowerInvariant().Equals(key.ToLowerInvariant())).First().Value;
      }
    }

    public List<Setting> GetSettingsByScope(SettingScope scope)
    {
      return this.Settings.Where(s => s.Value.SettingScope == scope).Select(a => a.Value).ToList();
    }

    public async Task<Setting> UpdateSingleSetting(Setting updateSetting)
    {
      using (var scope = serviceProvider.CreateScope())
      {
        var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();
        var setting = await db.Settings.FindAsync(updateSetting.Key);

        switch (setting.SettingType)
        {
          case SettingType.Boolean:
            bool boolVal = false;
            if (!Boolean.TryParse(updateSetting.Value, out boolVal))
            {
              throw new Exception($"The value of this setting must be of type '{setting.SettingType.ToString()}'");
            }
            break;

          case SettingType.String:
            break;

          case SettingType.Int:
            int intVal = -1;
            if (!int.TryParse(updateSetting.Value, out intVal))
            {
              throw new Exception($"The value of this setting must be of type '{setting.SettingType.ToString()}'");
            }
            break;

          case SettingType.Double:
            double doubleVal = 0.0d;
            try
            {
              doubleVal = Convert.ToDouble(updateSetting.Value, CultureInfo.InvariantCulture);
            }
            catch (Exception)
            {
              throw new Exception($"The value of this setting must be of type '{setting.SettingType.ToString()}'");
            }
            break;

          case SettingType.JSON:
            object jsonVal = null;
            try
            {
              jsonVal = JsonConvert.DeserializeObject(updateSetting.Value);
            }
            catch (Exception)
            {
              throw new Exception($"The value of this setting must be of type '{setting.SettingType.ToString()}'");
            }
            break;

          default:
            throw new NotImplementedException($"The setting type '{setting.SettingType}' is not implemented or not supported.");
        }

        setting.Value = updateSetting.Value;

        await db.SaveChangesAsync();

        //update settings dictionary
        lock (settingsLock)
        {
          this.Settings[setting.Key] = setting;
        }

        return setting;
      }
    }

    public async Task<List<Setting>> UpdateMultipleSettings(List<Setting> updateSettings)
    {
      List<Setting> results = new List<Setting>();

      foreach (var updateSetting in updateSettings)
      {
        results.Add(await this.UpdateSingleSetting(updateSetting));
      }

      return results;
    }

    #endregion private methods

    private void RegisterDefaultSettings()
    {
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

          WifiMode = WifiMode.AccessPoint,
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
            Ip = "192.168.100.1",
            Gateway = "", //not used
            SubnetMask = "255.255.255.0",
            Dns0 = "", //not used
            Dns1 = "", //not used
            SSID = "nervbox",
            PSK = "nervboxSecret",
            Channel = 1,
            LeaseHours = 24 * 7,
            RangeStart = "192.168.100.50",
            RangeEnd = "192.168.100.100"
          }
        })
      });

    }
  }
}
