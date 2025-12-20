using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using NervboxDeamon.DbModels;
using Microsoft.Extensions.DependencyInjection;
using Newtonsoft.Json;
using NervboxDeamon.Models.Settings;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;
using Microsoft.AspNetCore.SignalR;
using NervboxDeamon.Hubs;
using NervboxDeamon.Helpers;
using System.IO;
using System.Security.Cryptography;
using System.Collections.Concurrent;
using System.Threading;
using System.Net;
using System.Diagnostics;
using Microsoft.AspNetCore.Hosting;
using NervboxDeamon.Services.Interfaces;

namespace NervboxDeamon.Services
{
  public class PlaySoundResult
  {
    public bool Success { get; set; }
    public string Error { get; set; }
    public int? CreditsRemaining { get; set; }

    public static PlaySoundResult Ok(int creditsRemaining) => new PlaySoundResult { Success = true, CreditsRemaining = creditsRemaining };
    public static PlaySoundResult Fail(string error) => new PlaySoundResult { Success = false, Error = error };
  }

  public interface ISoundService
  {
    void Init();
    PlaySoundResult PlaySound(string soundId, int userId);
    void KillAll();
    void AddSoundToCache(Sound sound);
    void UpdateSoundEnabledStatus(string hash, bool enabled);
    void RemoveSoundFromCache(string hash);
  }

  public static class SoundHelper
  {
    /// <summary>
    /// Ermittelt die Dauer einer Audio-Datei in Millisekunden
    /// </summary>
    public static int GetDurationMs(string filePath)
    {
      try
      {
        var file = TagLib.File.Create(filePath);
        return (int)file.Properties.Duration.TotalMilliseconds;
      }
      catch
      {
        return 0;
      }
    }

    /// <summary>
    /// Berechnet den MD5-Hash einer Datei
    /// </summary>
    public static string GetFileHash(string filePath)
    {
      using (var md5 = MD5.Create())
      using (var stream = File.OpenRead(filePath))
      {
        var hashBytes = md5.ComputeHash(stream);
        return BitConverter.ToString(hashBytes).Replace("-", "").ToLowerInvariant();
      }
    }
  }

  public class SoundService : ISoundService
  {
    //injected
    private readonly ILogger<ISoundService> Logger;
    private readonly IConfiguration Configuration;
    private readonly IServiceProvider serviceProvider;
    private ISshService SshService { get; }
    private readonly IHubContext<SoundHub> SoundHub;
    private IWebHostEnvironment Environment { get; }
    private ICreditService CreditService { get; set; }

    //member
    public ConcurrentDictionary<int, User> UserLookup { private set; get; } = new ConcurrentDictionary<int, User>();
    private Dictionary<string, Sound> Sounds { get; set; }
    private DirectoryInfo SoundDirectory { get; set; }
    private string SoundDirectoryDebugPlay { get; set; }
    private AppSettings appSettings { get; set; }
    private ConcurrentQueue<SoundUsage> Usages { get; set; } = new ConcurrentQueue<SoundUsage>();
    private Thread LoggingThread = null;
    private bool keepRunning = true;

    public SoundService(
      IServiceProvider serviceProvider,
      ILogger<ISoundService> logger,
      IConfiguration configuration,
      ISshService sshService,
      IHubContext<SoundHub> soundHub,
      IWebHostEnvironment environment
      )
    {
      this.serviceProvider = serviceProvider;
      this.Logger = logger;
      this.Configuration = configuration;
      this.SshService = sshService;
      this.SoundHub = soundHub;
      this.Environment = environment;

      LoggingThread = new Thread(() =>
      {
        while (keepRunning)
        {
          if (!Usages.IsEmpty)
          {
            List<SoundUsage> tempsForSave = new List<SoundUsage>();
            while (!Usages.IsEmpty)
            {
              if (Usages.TryDequeue(out SoundUsage item))
              {
                tempsForSave.Add(item);
              }
            }

            using (var scope = serviceProvider.CreateScope())
            {
              var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();
              db.SoundUsages.AddRange(tempsForSave);
              db.SaveChanges();
            }
          }

          Thread.Sleep(10000);
        }
      });

      LoggingThread.Start();
    }

    public void Init()
    {
      InitUserLookup();

      // Get CreditService from DI (can't inject in constructor due to circular dependency)
      CreditService = serviceProvider.GetRequiredService<ICreditService>();

      var appSettingsSection = Configuration.GetSection("AppSettings");
      appSettings = appSettingsSection.Get<AppSettings>();

      if (Environment.EnvironmentName == "Development")
      {
        SoundDirectoryDebugPlay = appSettings.SoundPathDebugPlay;
      }

      SoundDirectory = new DirectoryInfo(appSettings.SoundPath);

      if (!SoundDirectory.Exists)
      {
        Logger.LogWarning($"Sound directory does not exist: {SoundDirectory.FullName}");
        this.Sounds = new Dictionary<string, Sound>();
        return;
      }

      var soundFiles = SoundDirectory.GetFiles();
      List<dynamic> found = new List<dynamic>();

      foreach (FileInfo fi in soundFiles)
      {
        string fileName = fi.Name;
        string name = Path.GetFileNameWithoutExtension(fi.Name);
        string hash = SoundHelper.GetFileHash(fi.FullName);
        int durationMs = SoundHelper.GetDurationMs(fi.FullName);

        found.Add(new { Name = name, FileName = fileName, Hash = hash, SizeBytes = fi.Length, DurationMs = durationMs });
      }

      using (var scope = serviceProvider.CreateScope())
      {
        bool soundsChanged = false;

        var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();
        var existing = db.Sounds.ToList();

        var validSounds = existing.Where(e => found.Exists(f => e.Hash.Equals(f.Hash))).ToList();
        var invalidSounds = existing.Where(e => !found.Exists(f => e.Hash.Equals(f.Hash))).ToList();
        var newSounds = found.Where(f => !existing.Exists(e => e.Hash.Equals(f.Hash))).ToList();

        // 1) Mark removed sounds as disabled
        foreach (var invalidSound in invalidSounds)
        {
          invalidSound.Enabled = false;
          soundsChanged = true;
        }

        // 2) Add new sounds
        foreach (var newSound in newSounds)
        {
          try
          {
            db.Sounds.Add(new Sound()
            {
              Hash = newSound.Hash,
              Name = newSound.Name,
              FileName = newSound.FileName,
              SizeBytes = newSound.SizeBytes,
              DurationMs = newSound.DurationMs,
              Enabled = true
            });
            soundsChanged = true;
          }
          catch (Exception ex)
          {
            Logger.LogDebug($"Cannot add sound with hash {newSound.Hash} and filename {newSound.FileName}. Exception: {ex}");
          }
        }

        // 3) Update filename if changed for valid sounds
        foreach (var sound in validSounds)
        {
          try
          {
            var foundSound = found.Where(f => f.Hash.Equals(sound.Hash)).Single();

            if (!foundSound.FileName.Equals(sound.FileName))
            {
              sound.FileName = foundSound.FileName;
              sound.Name = foundSound.Name;
              soundsChanged = true;
            }

            // Re-enable if previously disabled
            if (!sound.Enabled)
            {
              sound.Enabled = true;
              soundsChanged = true;
            }
          }
          catch (Exception)
          {
            // Multiple files with same hash - skip
          }
        }

        if (soundsChanged)
        {
          db.SaveChanges();
        }

        // Load all enabled sounds
        this.Sounds = db.Sounds.Where(s => s.Enabled).ToDictionary(s => s.Hash, s => s);
      }
    }



    public void InitUserLookup()
    {
      using (var scope = serviceProvider.CreateScope())
      {
        var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();
        db.Users.ToList().ForEach(user =>
        {
          UserLookup.AddOrUpdate(user.Id, user, (id, newUser) => { return newUser; });
        });
      }
    }

    public PlaySoundResult PlaySound(string soundId, int userId)
    {
      if (!this.Sounds.TryGetValue(soundId, out var sound))
      {
        Logger.LogWarning($"Sound not found: {soundId}");
        return PlaySoundResult.Fail("Sound not found");
      }

      // Check and deduct credits
      var settings = CreditService.GetSettings();
      var cost = settings.CostPerSoundPlay;

      if (!CreditService.HasEnoughCredits(userId, cost))
      {
        var currentCredits = CreditService.GetUserCredits(userId);
        Logger.LogDebug($"User {userId} has insufficient credits ({currentCredits} < {cost})");
        return PlaySoundResult.Fail($"Nicht genug Credits. Du hast {currentCredits}, brauchst aber {cost}.");
      }

      // Deduct credits (this also broadcasts the update via SignalR)
      if (!CreditService.DeductCredits(userId, cost, DbModels.CreditTransactionType.SoundPlay, $"Sound: {sound.Name}", sound.Hash))
      {
        return PlaySoundResult.Fail("Fehler beim Abbuchen der Credits");
      }

      var creditsRemaining = CreditService.GetUserCredits(userId);

      // Play the sound asynchronously
      new Task(() =>
      {
        if (appSettings.SSH?.Enabled == true)
        {
          // Remote via SSH auf Raspberry Pi
          var path = SoundDirectory.FullName;
          if (Environment.EnvironmentName == "Development")
          {
            path = SoundDirectoryDebugPlay;
          }
          this.SshService.SendCmd($"mpg123 -q --no-control {path}/{sound.FileName.Replace("!", "\\!").Replace(" ", "\\ ")} &");
        }
        else
        {
          // Lokal abspielen
          var localPath = Path.Combine(SoundDirectory.FullName, sound.FileName);
          PlayLocal(localPath);
        }

        var usage = new SoundUsage()
        {
          UserId = userId,
          PlayedAt = DateTime.UtcNow,
          SoundHash = sound.Hash
        };

        this.Usages.Enqueue(usage);

        if (!UserLookup.ContainsKey(userId))
        {
          InitUserLookup();
        }

        User initiator = UserLookup[userId];

        this.SoundHub.Clients.All.SendAsync("soundPlayed", new
        {
          Initiator = new { Name = initiator.FirstName + " " + initiator.LastName, Id = initiator.Id },
          Time = DateTime.UtcNow,
          SoundHash = sound.Hash,
          FileName = sound.FileName
        });

      }).Start();

      return PlaySoundResult.Ok(creditsRemaining);
    }

    private void PlayLocal(string filePath)
    {
      try
      {
        var player = appSettings.LocalPlayer ?? "mpg123";
        var args = player switch
        {
          "mpg123" => $"-q \"{filePath}\"",
          "ffplay" => $"-nodisp -autoexit -loglevel quiet \"{filePath}\"",
          "cvlc" => $"--play-and-exit --quiet \"{filePath}\"",
          _ => $"-q \"{filePath}\""
        };

        Logger.LogDebug($"Playing locally with {player}: {filePath}");

        Process.Start(new ProcessStartInfo
        {
          FileName = player,
          Arguments = args,
          UseShellExecute = false,
          CreateNoWindow = true,
          RedirectStandardOutput = true,
          RedirectStandardError = true
        });
      }
      catch (Exception ex)
      {
        Logger.LogError($"Failed to play sound locally: {ex.Message}");
      }
    }

    public void KillAll()
    {
      if (appSettings.SSH?.Enabled == true)
      {
        // Remote via SSH
        this.SshService.SendCmd($"sudo pkill -f mpg123");
        this.SshService.SendCmd($"sudo pkill -f omxplayer");
        this.SshService.SendCmd($"sudo pkill -f aplay");
      }
      else
      {
        // Lokal
        KillLocalPlayers();
      }
    }

    private void KillLocalPlayers()
    {
      var players = new[] { "mpg123", "ffplay", "cvlc" };
      foreach (var player in players)
      {
        try
        {
          Process.Start(new ProcessStartInfo
          {
            FileName = "pkill",
            Arguments = $"-f {player}",
            UseShellExecute = false,
            CreateNoWindow = true
          });
        }
        catch
        {
          // Player not running or pkill failed - ignore
        }
      }
    }

    public void AddSoundToCache(Sound sound)
    {
      if (sound != null && !string.IsNullOrEmpty(sound.Hash))
      {
        this.Sounds[sound.Hash] = sound;
        Logger.LogInformation($"Added sound to cache: {sound.Name} ({sound.Hash})");
      }
    }

    public void UpdateSoundEnabledStatus(string hash, bool enabled)
    {
      if (this.Sounds.TryGetValue(hash, out var sound))
      {
        if (enabled)
        {
          sound.Enabled = true;
          Logger.LogInformation($"Enabled sound in cache: {sound.Name} ({hash})");
        }
        else
        {
          this.Sounds.Remove(hash);
          Logger.LogInformation($"Removed disabled sound from cache: {sound.Name} ({hash})");
        }
      }
      else if (enabled)
      {
        // Sound was disabled and now enabled - need to reload from DB
        using (var scope = serviceProvider.CreateScope())
        {
          var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();
          var dbSound = db.Sounds.FirstOrDefault(s => s.Hash == hash);
          if (dbSound != null)
          {
            this.Sounds[hash] = dbSound;
            Logger.LogInformation($"Re-added enabled sound to cache: {dbSound.Name} ({hash})");
          }
        }
      }
    }

    public void RemoveSoundFromCache(string hash)
    {
      if (this.Sounds.TryGetValue(hash, out var sound))
      {
        this.Sounds.Remove(hash);
        Logger.LogInformation($"Removed sound from cache: {sound.Name} ({hash})");
      }
    }

  }
}
