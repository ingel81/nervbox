using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using NervboxDeamon.DbModels;
using NervboxDeamon.Hubs;
using NervboxDeamon.Models;

namespace NervboxDeamon.Services
{
  public interface IRecordingService
  {
    void Init();
    void Stop();

    void AddMeasure(MeasureSet measure);
  }

  public class RecordingService : IRecordingService
  {
    //injected
    private readonly ILogger<RecordingService> Logger;
    private readonly IConfiguration Configuration;
    private readonly IHostApplicationLifetime ApplicationLifetime;
    private readonly IHubContext<InfoModuleHub> ModuleHub;
    private readonly IServiceProvider ServiceProvider;
    private readonly ISettingsService SettingsService;

    //member
    private Thread recordingThread;
    private bool keepRunning = true;

    private readonly ConcurrentQueue<MeasureSet> pushMeasures = new ConcurrentQueue<MeasureSet>();
    private readonly ConcurrentQueue<MeasureSet> pullMeasures = new ConcurrentQueue<MeasureSet>();

    private Record lastSavedRecord = null;

    private DateTime lastSave = DateTime.MinValue;

    [Obsolete]
    public RecordingService(
      ILogger<RecordingService> logger,
      IConfiguration configuration,
      IHostApplicationLifetime appLifetime,
      IHubContext<InfoModuleHub> moduleHub,
      IServiceProvider serviceProvider,
      ISettingsService settingService
      )
    {
      this.Logger = logger;
      this.Configuration = configuration;
      this.ApplicationLifetime = appLifetime;
      this.ModuleHub = moduleHub;
      this.ServiceProvider = serviceProvider;
      this.SettingsService = settingService;

      ApplicationLifetime.ApplicationStopping.Register(() =>
      {
        this.Stop();
      });
    }

    public void Init()
    {
      using (var scope = ServiceProvider.CreateScope())
      {
        var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();
        try
        {
          this.lastSave = db.Records.Max(t => t.Time);
        }
        catch (Exception ex)
        {
          this.Logger.LogError($"Determining last save time failed with error {ex.ToString()}");

          this.lastSave = DateTime.MinValue;
        }
      }

      this.Logger.LogDebug("starting...");

      recordingThread = new Thread(() =>
      {
        while (keepRunning)
        {
          try
          {
            #region Pushed Measures

            if (this.pushMeasures.Count > 0)
            {
              var minimumRecordingInterval = this.SettingsService.GetSingleSettingByKey("recordingMinimumInterval").AsInt();

              // Zusammenfassung von Werten
              if (minimumRecordingInterval != 0 && (DateTime.UtcNow - this.lastSave).TotalMilliseconds >= minimumRecordingInterval)
              {
                List<MeasureSet> toBeSaved = new List<MeasureSet>();
                while (!pushMeasures.IsEmpty)
                {
                  if (this.pushMeasures.TryDequeue(out MeasureSet item))
                  {
                    toBeSaved.Add(item);
                  }
                }

                if (toBeSaved.Count == 0)
                {
                  this.Logger.Log(LogLevel.Error, "Unable to dequeue measurements");
                }
                else if (toBeSaved.Count > 0)
                {
                  using (var scope = ServiceProvider.CreateScope())
                  {
                    var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();

                    Record record = null;

                    switch (this.SettingsService.GetSingleSettingByKey("recordingGroupMethod").Value)
                    {
                      case "min":
                        record = new Record()
                        {
                          Acceleration = toBeSaved.Min(e => e.Acceleration),
                          Current = toBeSaved.Min(e => e.Current),
                          CyclesDelivery = toBeSaved.Max(e => e.CyclesSinceDelivery), //always max
                          CyclesMaintenance = toBeSaved.Max(e => e.CyclesSinceMaintenance), //always max
                          CyclesCleaning = toBeSaved.Max(e => e.CyclesSinceCleaning), //always max
                          Temperature1 = toBeSaved.Min(e => e.Temperature1),
                          Temperature2 = toBeSaved.Min(e => e.Temperature2),
                          Temperature3 = toBeSaved.Min(e => e.Temperature3),
                          TemperatureB = toBeSaved.Min(e => e.TemperatureB),
                          Time = toBeSaved.Max(e => e.Time), //always max
                          ModulePush = toBeSaved.Last().ModulePush,
                          ArticleNumber = toBeSaved.Last().ArticleNumber,
                        };
                        break;

                      case "max":
                        record = new Record()
                        {
                          Acceleration = toBeSaved.Max(e => e.Acceleration),
                          Current = toBeSaved.Max(e => e.Current),
                          CyclesDelivery = toBeSaved.Max(e => e.CyclesSinceDelivery), //always max
                          CyclesMaintenance = toBeSaved.Max(e => e.CyclesSinceMaintenance), //always max
                          CyclesCleaning = toBeSaved.Max(e => e.CyclesSinceCleaning), //always max
                          Temperature1 = toBeSaved.Max(e => e.Temperature1),
                          Temperature2 = toBeSaved.Max(e => e.Temperature2),
                          Temperature3 = toBeSaved.Max(e => e.Temperature3),
                          TemperatureB = toBeSaved.Max(e => e.TemperatureB),
                          Time = toBeSaved.Max(e => e.Time), //always max
                          ModulePush = toBeSaved.Last().ModulePush,
                          ArticleNumber = toBeSaved.Last().ArticleNumber,
                        };
                        break;

                      case "avg":
                        record = new Record()
                        {
                          Acceleration = toBeSaved.Average(e => e.Acceleration),
                          Current = toBeSaved.Average(e => e.Current),
                          CyclesDelivery = toBeSaved.Max(e => e.CyclesSinceDelivery),//always max
                          CyclesMaintenance = toBeSaved.Max(e => e.CyclesSinceMaintenance),//always max
                          CyclesCleaning = toBeSaved.Max(e => e.CyclesSinceCleaning),//always max
                          Temperature1 = toBeSaved.Average(e => e.Temperature1),
                          Temperature2 = toBeSaved.Average(e => e.Temperature2),
                          Temperature3 = toBeSaved.Average(e => e.Temperature3),
                          TemperatureB = toBeSaved.Average(e => e.TemperatureB),
                          Time = toBeSaved.Max(e => e.Time), //always max
                          ModulePush = toBeSaved.Last().ModulePush,
                          ArticleNumber = toBeSaved.Last().ArticleNumber,
                        };
                        break;

                      default:
                        throw new Exception($"Record group method {this.SettingsService.GetSingleSettingByKey("recordingGroupMethod").Value} not implemented.");
                    }

                    this.SaveRecord(record);
                  }
                }
              }

              else //einzelne Datensätze pro Insert
              {

                if (!this.pushMeasures.TryDequeue(out MeasureSet item))
                {
                  this.Logger.LogError("Error dequeue MeasureSet from pushMeasures Queue.");
                  continue;
                }

                Record record = new Record()
                {
                  Acceleration = item.Acceleration,
                  Current = item.Current,
                  CyclesDelivery = item.CyclesSinceDelivery,
                  CyclesMaintenance = item.CyclesSinceMaintenance,
                  CyclesCleaning = item.CyclesSinceCleaning,
                  Temperature1 = item.Temperature1,
                  Temperature2 = item.Temperature2,
                  Temperature3 = item.Temperature3,
                  TemperatureB = item.TemperatureB,
                  Time = item.Time,
                  ModulePush = item.ModulePush,
                  ArticleNumber = item.ArticleNumber,
                };

                this.SaveRecord(record);
              }
            }

            #endregion

            #region Pulled Measures

            if (this.pullMeasures.Count > 0)
            {
              if (!this.pullMeasures.TryDequeue(out MeasureSet item))
              {
                this.Logger.LogError("Error dequeue MeasureSet from pullMeasures Queue.");
                continue;
              }

              Record record = new Record()
              {
                Acceleration = item.Acceleration,
                Current = item.Current,
                CyclesDelivery = item.CyclesSinceDelivery,
                CyclesMaintenance = item.CyclesSinceMaintenance,
                CyclesCleaning = item.CyclesSinceCleaning,
                Temperature1 = item.Temperature1,
                Temperature2 = item.Temperature2,
                Temperature3 = item.Temperature3,
                TemperatureB = item.TemperatureB,
                Time = item.Time,
                ModulePush = item.ModulePush,
                ArticleNumber = item.ArticleNumber,
              };

              //check ob es Sinn macht diesen zu speichern (abweichung prozentual o. gleitender mittelwert oder ähnliches)
              if (ShouldSavePullRecord(record))
              {
                this.SaveRecord(record);
                this.Logger.LogDebug("value based save of record");
              }
              else if (this.SettingsService.GetSingleSettingByKey("recordingForcePullSave").AsInt() > 0
              && (DateTime.UtcNow - this.lastSave).TotalMilliseconds >= this.SettingsService.GetSingleSettingByKey("recordingForcePullSave").AsInt())
              {
                this.SaveRecord(record);
                this.Logger.LogDebug("forced save of record");
              }
            }

            #endregion

            Thread.Sleep(100);
          }
          catch (Exception ex)
          {
            this.Logger.LogCritical($"Error in Recording loop: {ex.ToString()}");
          }
        }
      });

      recordingThread.Start();
    }

    public void Stop()
    {
      this.Logger.LogDebug("stopping...");
      this.keepRunning = false;

      recordingThread.Join();
      recordingThread = null;

      this.Logger.LogDebug("stopped");
    }

    private void SaveRecord(Record saveRecord)
    {
      using (var scope = ServiceProvider.CreateScope())
      {
        var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();

        //save
        db.Add(saveRecord);
        db.SaveChanges();
        this.lastSave = DateTime.UtcNow;
        this.lastSavedRecord = saveRecord;
      }
    }

    private class ValueComparer
    {
      public enum ComparerTypes { Measure, Cycle }

      public ComparerTypes ComparerType { get; set; }
      public string Key { get; set; }
      public double DeltaPercSetting { get; set; }
      public double PercMin { get => 1 - DeltaPercSetting; }
      public double PercMax { get => 1 + DeltaPercSetting; }
      public object OldValue { get; set; }
      public object NewValue { get; set; }

      public double? Value { get; set; } = null;

      public bool IsDelta
      {
        get
        {
          if (ComparerType == ComparerTypes.Cycle)
          {
            return !OldValue.ToString().Equals(NewValue.ToString());
          }
          else
          {
            if (!this.Value.HasValue)
            {
              this.Value = Math.Abs((double)this.OldValue / (double)this.NewValue);
            }

            return this.Value <= this.PercMin || this.Value >= this.PercMax;
          }
        }
      }

      public string DebugLogLine
      {
        get
        {
          return $"{Key}: {Value} ==> Old-Value: {OldValue} | New-Value: {NewValue} | DeltaPercSetting: { DeltaPercSetting}";
        }
      }
    }

    private bool ShouldSavePullRecord(Record saveCandidate)
    {
      if (this.lastSavedRecord == null)
      {
        return true;
      }

      Dictionary<string, ValueComparer> comparers = new Dictionary<string, ValueComparer>();

      comparers.Add("CyclesCleaning", new ValueComparer()
      {
        Key = "CyclesCleaning",
        ComparerType = ValueComparer.ComparerTypes.Cycle,
        DeltaPercSetting = 0d,
        NewValue = saveCandidate.CyclesCleaning,
        OldValue = this.lastSavedRecord.CyclesCleaning,
      });

      comparers.Add("CyclesMaintenance", new ValueComparer()
      {
        Key = "CyclesMaintenance",
        ComparerType = ValueComparer.ComparerTypes.Cycle,
        DeltaPercSetting = 0d,
        NewValue = saveCandidate.CyclesMaintenance,
        OldValue = this.lastSavedRecord.CyclesMaintenance,
      });

      comparers.Add("CyclesDelivery", new ValueComparer()
      {
        Key = "CyclesDelivery",
        ComparerType = ValueComparer.ComparerTypes.Cycle,
        DeltaPercSetting = 0d,
        NewValue = saveCandidate.CyclesDelivery,
        OldValue = this.lastSavedRecord.CyclesDelivery,
      });

      comparers.Add("Acceleration", new ValueComparer()
      {
        Key = "Acceleration",
        ComparerType = ValueComparer.ComparerTypes.Measure,
        DeltaPercSetting = this.SettingsService.GetSingleSettingByKey("recordingDeltaPercAcceleration").AsDouble(),
        NewValue = saveCandidate.Acceleration,
        OldValue = this.lastSavedRecord.Acceleration,
      });

      comparers.Add("Current", new ValueComparer()
      {
        Key = "Current",
        ComparerType = ValueComparer.ComparerTypes.Measure,
        DeltaPercSetting = this.SettingsService.GetSingleSettingByKey("recordingDeltaPercCurrent").AsDouble(),
        NewValue = saveCandidate.Current,
        OldValue = this.lastSavedRecord.Current,
      });

      comparers.Add("Temperature1", new ValueComparer()
      {
        Key = "Temperature1",
        ComparerType = ValueComparer.ComparerTypes.Measure,
        DeltaPercSetting = this.SettingsService.GetSingleSettingByKey("recordingDeltaPercT1").AsDouble(),
        NewValue = saveCandidate.Temperature1,
        OldValue = this.lastSavedRecord.Temperature1,
      });

      comparers.Add("Temperature2", new ValueComparer()
      {
        Key = "Temperature2",
        ComparerType = ValueComparer.ComparerTypes.Measure,
        DeltaPercSetting = this.SettingsService.GetSingleSettingByKey("recordingDeltaPercT2").AsDouble(),
        NewValue = saveCandidate.Temperature2,
        OldValue = this.lastSavedRecord.Temperature2,
      });

      comparers.Add("Temperature3", new ValueComparer()
      {
        Key = "Temperature3",
        ComparerType = ValueComparer.ComparerTypes.Measure,
        DeltaPercSetting = this.SettingsService.GetSingleSettingByKey("recordingDeltaPercT3").AsDouble(),
        NewValue = saveCandidate.Temperature3,
        OldValue = this.lastSavedRecord.Temperature3,
      });

      comparers.Add("TemperatureB", new ValueComparer()
      {
        Key = "TemperatureB",
        ComparerType = ValueComparer.ComparerTypes.Measure,
        DeltaPercSetting = this.SettingsService.GetSingleSettingByKey("recordingDeltaPercTB").AsDouble(),
        NewValue = saveCandidate.TemperatureB,
        OldValue = this.lastSavedRecord.TemperatureB,
      });

      if (comparers.Any(c => c.Value.IsDelta))
      {
        this.Logger.LogDebug("Change found in record...");

        foreach (var e in comparers)
        {
          if (e.Value.IsDelta)
          {
            this.Logger.LogDebug(e.Value.DebugLogLine);
          }
        }

        this.Logger.LogDebug("Record recommended for save...");

        return true;
      }
      else
      {
        //this.Logger.LogDebug("Record not recommended for save....delta too small.");
        return false;
      }
    }

    /// <summary>
    /// Fügt einen Messwertdatensatz zu Verarbeitung als Record hinzu
    /// </summary>
    /// <param name="measure"></param>
    public void AddMeasure(MeasureSet measure)
    {
      if (measure.ModulePush)
      {
        this.pushMeasures.Enqueue(measure);
      }
      else
      {
        this.pullMeasures.Enqueue(measure);
      }
    }

  }
}
