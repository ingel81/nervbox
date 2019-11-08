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

      #region recording

      defaultSettings.Add(new Setting()
      {
        Key = "recordingMinimumInterval",
        SettingScope = SettingScope.Recording,
        SettingType = SettingType.Int,
        Description = "Treten im angegebenen Zeitraum mehrere Messwerte auf, werden diese zusammengefasst und als ein einziger Datenpukt gespeichert um die Datenmenge sinvoll zu reduzieren.<br>" +
                      "[Default] = 0 = Deaktiviert --> Jeder einzelne Datenpunkt wird gespeichert.<br>" +
                      "Art der Zusammenfassung: Siehe nächste Einstellung (sofern Wert ungleich 0).",
        Value = (0).ToString()
      });

      defaultSettings.Add(new Setting()
      {
        Key = "recordingGroupMethod",
        SettingScope = SettingScope.Recording,
        SettingType = SettingType.String,
        Description = "'Durchschnitt' : Es wird der Durchschnitt der Messwerte verwendet<br>" +
                      "'Maximum' : Es wird von allen Messwerten der größte aufgetretene Wert verwendet<br>" +
                      "'Minimum' : Es wird von allen Messwerten der kleinste aufgetretene Wert verwendet",
        Value = "avg"
      });

      defaultSettings.Add(new Setting()
      {
        Key = "recordingIdletimeForcePullRecord",
        SettingScope = SettingScope.Recording,
        SettingType = SettingType.Int,
        Description = "Treten für die Angegebene Zeit keine Messwerte durch einen Push vom Mess-Modus des Moduls auf, wird ein Datenpunkt durch Polling erzeugt.<br> " +
                      "[Default] = 5000 --> Es werden im Leerlauf mindestens alle 5 Sekunden Datenpunkte gepollt.<br>" +
                      "[Deaktivieren] = 0 --> Es werden im Leerlauf keine Datenpunkte gepollt.<br>" +
                      "<br>" +
                      "Ob ein so erzeugter Messwert ablagewürdig ist, entscheiden die nachfolgenden Einzeldeltas zu den Messwerten.",
        Value = (5000).ToString()
      });

      defaultSettings.Add(new Setting()
      {
        Key = "recordingDeltaPercAcceleration",
        SettingScope = SettingScope.Recording,
        SettingType = SettingType.Double,
        Description = "Speicherbedingung für Pull-Werte in prozentualer Veränderung in % [0% = 0.00, 100% = 1.00] gegenüber dem letzten gespeicherten Wert.",
        Value = (0.05d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "recordingDeltaPercCurrent",
        SettingScope = SettingScope.Recording,
        SettingType = SettingType.Double,
        Description = "Speicherbedingung für Pull-Werte in prozentualer Veränderung in % [0% = 0.00, 100% = 1.00] gegenüber dem letzten gespeicherten Wert.",
        Value = (0.10d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "recordingDeltaPercT1",
        SettingScope = SettingScope.Recording,
        SettingType = SettingType.Double,
        Description = "Speicherbedingung für Pull-Werte in prozentualer Veränderung in % [0% = 0.00, 100% = 1.00] gegenüber dem letzten gespeicherten Wert.",
        Value = (0.05d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "recordingDeltaPercT2",
        SettingScope = SettingScope.Recording,
        SettingType = SettingType.Double,
        Description = "Speicherbedingung für Pull-Werte in prozentualer Veränderung in % [0% = 0.00, 100% = 1.00] gegenüber dem letzten gespeicherten Wert.",
        Value = (0.05d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "recordingDeltaPercT3",
        SettingScope = SettingScope.Recording,
        SettingType = SettingType.Double,
        Description = "Speicherbedingung für Pull-Werte in prozentualer Veränderung in % [0% = 0.00, 100% = 1.00] gegenüber dem letzten gespeicherten Wert.",
        Value = (0.05d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "recordingDeltaPercTB",
        SettingScope = SettingScope.Recording,
        SettingType = SettingType.Double,
        Description = "Speicherbedingung für Pull-Werte in prozentualer Veränderung in % [0% = 0.00, 100% = 1.00] gegenüber dem letzten gespeicherten Wert.",
        Value = (0.05d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "recordingForcePullSave",
        SettingScope = SettingScope.Recording,
        SettingType = SettingType.Int,
        Description = "Sind mit den oben genanten Speicherbedingungen keine Datenpunkte erzeugt worden kann mit dieser Option eine Speicherung unabhängig von Werteveränderungen erzwungen werden.<br> " +
                      "[Default] = 60000 --> Es werden im Leerlauf mindestens alle 60 Sekunden eine Datenpunktspeicherung erzwungen.<br>" +
                      "[Deaktivieren] = 0 --> Es werden im Leerlauf keine Datenpunktspeicherungen erzwungen.<br>" +
                      "<br>" +
                      "Dieser Werte muss größer oder ein Vielfaches der Einstellung 'Werte-Abholung (Pull) im Leerlauf [ms]' sein",

        Value = (60000).ToString()
      });

      #endregion recording

      #region features

      defaultSettings.Add(new Setting()
      {
        Key = "moduleFeatureTemperatureMonitoring",
        SettingScope = SettingScope.ModuleFeatures,
        SettingType = SettingType.Boolean,
        Description = "Temperaturüberwachung am Kontakt (bestellbare Option)",
        Value = true.ToString()
      });

      defaultSettings.Add(new Setting()
      {
        Key = "moduleFeatureLed",
        SettingScope = SettingScope.ModuleFeatures,
        SettingType = SettingType.Boolean,
        Description = "LED (bestellbare Option)",
        Value = true.ToString()
      });

      defaultSettings.Add(new Setting()
      {
        Key = "moduleFeatureOutput1",
        SettingScope = SettingScope.ModuleFeatures,
        SettingType = SettingType.String,
        Description = "Typ Ausgang1",
        Value = "NONE"
      });

      defaultSettings.Add(new Setting()
      {
        Key = "moduleFeatureOutput2",
        SettingScope = SettingScope.ModuleFeatures,
        SettingType = SettingType.String,
        Description = "Typ Ausgang2",
        Value = "NONE"
      });

      #endregion features

      #region HealthScore

      defaultSettings.Add(new Setting()
      {
        Key = "healthScore_i_max",
        SettingScope = SettingScope.HealthScore,
        SettingType = SettingType.Double,
        Description = "maximal zu erwartender Strom",
        Value = (0.7d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "healthScore_delta_a_max",
        SettingScope = SettingScope.HealthScore,
        SettingType = SettingType.Double,
        Description = "maximale Differenz zu Stillstand bzw. gleichförmige Bewegung",
        Value = (1.0d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "healthScore_ambient_temp",
        SettingScope = SettingScope.HealthScore,
        SettingType = SettingType.Double,
        Description = "Umgebungstemperatur",
        Value = (30.0d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "healthScore_delta_t_max",
        SettingScope = SettingScope.HealthScore,
        SettingType = SettingType.Double,
        Description = "maximal zulässige Differenz zur Umgebungstemperatur",
        Value = (15.0d).ToString(CultureInfo.InvariantCulture)
      });


      #endregion HealthScore

      #region Module Parameters

      defaultSettings.Add(new Setting()
      {
        Key = "module_cyclesCounting_a0",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Double,
        Description = "Hysterese der Beschleunigung (zur Rauschunterdrückung)",
        Value = (0.0d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_cyclesCounting_a1",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Double,
        Description = "Schwellwert Beschleunigung (Erkennung bewegter Adapter)",
        Value = (0.0d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_cyclesCounting_b0",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Double,
        Description = "Strom-Hysterese (gegen Flackern und zur Rauschunterdrückung)",
        Value = (0.25d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_cyclesCounting_b1",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Double,
        Description = "Schwellwert Strom (Erkennung des Stroms bei Kontaktierung)",
        Value = (0.4d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_cyclesCounting_c0",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Double,
        Description = "Mindest-Schrittzeit (Unterdrückung zu häufiger Schrittwechsel)",
        Value = (0.4d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_cyclesCounting_c1",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Double,
        Description = "Beschl.-Timeout (für Rückstellung nach fälschlicher Erkennung)",
        Value = (0.0d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_cyclesCounting_c2",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Double,
        Description = "Strom-Timeout (für Rückstellung nach fälschlicher Erkennung)",
        Value = (0.4d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_cyclesCounting_c3",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Double,
        Description = "Zyklus-Dauer, typisch (für feststehende Adapter gemäß Lastenheft)",
        Value = (1.5d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_currentMeasurement_b5",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Double,
        Description = "Offset bei 0 mA",
        Value = (32.768d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_currentMeasurement_b6",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Double,
        Description = "Vollausschlag",
        Value = (11.4d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_hysteresis_e0",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Double,
        Description = "Temperatur-Hysterese",
        Value = (0.0d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_hysteresis_f0",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Double,
        Description = "Strom-Hysterese",
        Value = (0.0d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_output_q0",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Int,
        Description = "Ausgang Unterer o. oberer Grenzwert",
        Value = (0).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_output_q1",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Int,
        Description = "Verhalten Ausgang 1",
        Value = (0).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_output_q2",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Int,
        Description = "Verhalten Ausgang 2",
        Value = (0).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_output_p0",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Int,
        Description = "Invertierung der Ausgänge",
        Value = (0).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_limit_U3",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Int,
        Description = "Warngrenze Reinigung",
        Value = (50).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_limit_U4",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Int64,
        Description = "Fehlergrenze Reinigung",
        Value = (100).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_limit_V3",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Int64,
        Description = "Warngrenze Wartung",
        Value = (500).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_limit_V4",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Int64,
        Description = "Fehlergrenze Wartung",
        Value = (1000).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_limit_W3",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Int64,
        Description = "Warngrenze Nervbox",
        Value = (250000).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_limit_W4",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Int64,
        Description = "Fehlergrenze Nervbox",
        Value = (500000).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_limit_Y3",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Int64,
        Description = "Warngrenze Log-Intervall",
        Value = (0).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_limit_Y4",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Int64,
        Description = "Fehlergrenze Log-Intervall",
        Value = (2500).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_limit_K3",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Double,
        Description = "Warngrenze Beschleunigung",
        Value = (1d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_limit_K4",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Double,
        Description = "Fehlergrenze Beschleunigung",
        Value = (2d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_limit_D3",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Double,
        Description = "Warngrenze Strom",
        Value = (1.2d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_limit_D4",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Double,
        Description = "Fehlergrenze Strom",
        Value = (2.4d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_limit_Q3",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Double,
        Description = "Warngrenze Temperatur1",
        Value = (60d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_limit_Q4",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Double,
        Description = "Fehlergrenze Temperatur1",
        Value = (95d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_limit_R3",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Double,
        Description = "Warngrenze Temperatur2",
        Value = (60d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_limit_R4",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Double,
        Description = "Fehlergrenze Temperatur2",
        Value = (95d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_limit_S3",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Double,
        Description = "Warngrenze Temperatur3",
        Value = (60d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_limit_S4",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Double,
        Description = "Fehlergrenze Temperatur3",
        Value = (95d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_limit_T3",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Double,
        Description = "Warngrenze Temperatur Board",
        Value = (50d).ToString(CultureInfo.InvariantCulture)
      });

      defaultSettings.Add(new Setting()
      {
        Key = "module_limit_T4",
        SettingScope = SettingScope.Module,
        SettingType = SettingType.Double,
        Description = "Fehlergrenze Temperatur Board",
        Value = (95d).ToString(CultureInfo.InvariantCulture)
      });

      #endregion Module Parameters

    }
  }
}
