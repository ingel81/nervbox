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
    void Shutdown();
    PlaySoundResult PlaySound(string soundId, int userId);
    void KillAll();
    /// <summary>Play an arbitrary audio file on the server speakers (Local mode only).</summary>
    bool PlayFile(string filePath);
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

  public class SoundService : ISoundService, IDisposable
  {
    //injected
    private readonly ILogger<ISoundService> Logger;
    private readonly IConfiguration Configuration;
    private readonly IServiceProvider serviceProvider;
    private ISshService SshService { get; }
    private readonly IHubContext<SoundHub> SoundHub;
    private IWebHostEnvironment Environment { get; }
    private ICreditService CreditService { get; set; }
    private IAchievementService AchievementService { get; set; }
    private ILoudnessService Loudness { get; set; }

    //member
    public ConcurrentDictionary<int, User> UserLookup { private set; get; } = new ConcurrentDictionary<int, User>();
    private Dictionary<string, Sound> Sounds { get; set; }
    private DirectoryInfo SoundDirectory { get; set; }
    private string SoundDirectoryDebugPlay { get; set; }
    private AppSettings appSettings { get; set; }
    private ConcurrentQueue<SoundUsage> Usages { get; set; } = new ConcurrentQueue<SoundUsage>();
    private Thread LoggingThread = null;
    private volatile bool keepRunning = true;
    private readonly ManualResetEventSlim stopSignal = new ManualResetEventSlim(false);

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
          FlushUsages();
          // wait 10 s or until shutdown is signalled
          stopSignal.Wait(10000);
        }
        FlushUsages();
      })
      {
        IsBackground = true,
        Name = "SoundUsageLogger"
      };

      LoggingThread.Start();
    }

    private void FlushUsages()
    {
      if (Usages.IsEmpty) return;
      try
      {
        var tempsForSave = new List<SoundUsage>();
        while (Usages.TryDequeue(out SoundUsage item))
        {
          tempsForSave.Add(item);
        }

        using (var scope = serviceProvider.CreateScope())
        {
          var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();
          db.SoundUsages.AddRange(tempsForSave);
          db.SaveChanges();
        }
      }
      catch (Exception ex)
      {
        Logger.LogError(ex, "Failed to save sound usages");
      }
    }

    /// <summary>
    /// Called by the DI container on shutdown: stop the logger thread and persist pending usages.
    /// </summary>
    public void Dispose() => Shutdown();

    /// <summary>
    /// Stop the logger thread and persist pending usages. Idempotent; called on ApplicationStopping
    /// (while the DB is still available) and again by the DI container.
    /// </summary>
    public void Shutdown()
    {
      if (!keepRunning) return;
      keepRunning = false;
      Loudness?.Stop();
      stopSignal.Set();
      LoggingThread?.Join(TimeSpan.FromSeconds(5));
    }

    public void Init()
    {
      InitUserLookup();

      // Get CreditService from DI (can't inject in constructor due to circular dependency)
      CreditService = serviceProvider.GetRequiredService<ICreditService>();
      AchievementService = serviceProvider.GetRequiredService<IAchievementService>();
      Loudness = serviceProvider.GetRequiredService<ILoudnessService>();

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

      // Known files (same name + same size) reuse hash/duration from the DB instead of re-reading
      // all ~280 MB on every start. Only new or changed files are hashed.
      Dictionary<string, Sound> known;
      using (var scope = serviceProvider.CreateScope())
      {
        var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();
        known = db.Sounds.AsEnumerable()
          .Where(x => x.FileName != null)
          .GroupBy(x => x.FileName)
          .ToDictionary(g => g.Key, g => g.First());
      }
      int hashed = 0;

      foreach (FileInfo fi in soundFiles)
      {
        string fileName = fi.Name;
        string name = Path.GetFileNameWithoutExtension(fi.Name);
        string hash;
        int durationMs;
        if (known.TryGetValue(fileName, out var k) && k.SizeBytes == fi.Length && !string.IsNullOrEmpty(k.Hash))
        {
          hash = k.Hash;
          durationMs = k.DurationMs > 0 ? k.DurationMs : SoundHelper.GetDurationMs(fi.FullName);
        }
        else
        {
          hash = SoundHelper.GetFileHash(fi.FullName);
          durationMs = SoundHelper.GetDurationMs(fi.FullName);
          hashed++;
        }

        found.Add(new { Name = name, FileName = fileName, Hash = hash, SizeBytes = fi.Length, DurationMs = durationMs });
      }
      Logger.LogInformation("Sound scan: {Total} files, {Hashed} hashed (new/changed)", soundFiles.Length, hashed);

      using (var scope = serviceProvider.CreateScope())
      {
        bool soundsChanged = false;

        var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();
        var existing = db.Sounds.ToList();

        // Get system user for authoring scanned sounds
        var systemUser = db.Users.FirstOrDefault(u => u.Role == "system");
        var systemUserId = systemUser?.Id;

        var validSounds = existing.Where(e => found.Exists(f => e.Hash.Equals(f.Hash))).ToList();
        var invalidSounds = existing.Where(e => !found.Exists(f => e.Hash.Equals(f.Hash))).ToList();
        var newSounds = found.Where(f => !existing.Exists(e => e.Hash.Equals(f.Hash))).ToList();

        // 1) Mark removed sounds as disabled
        foreach (var invalidSound in invalidSounds)
        {
          invalidSound.Enabled = false;
          soundsChanged = true;
        }

        // 2) Add new sounds (with system user as author)
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
              Enabled = true,
              AuthorId = systemUserId
            });
            soundsChanged = true;
          }
          catch (Exception ex)
          {
            Logger.LogDebug($"Cannot add sound with hash {newSound.Hash} and filename {newSound.FileName}. Exception: {ex}");
          }
        }

        // 3) Set system user as author for sounds without author
        var soundsWithoutAuthor = existing.Where(s => s.AuthorId == null).ToList();
        if (soundsWithoutAuthor.Any() && systemUserId.HasValue)
        {
          foreach (var sound in soundsWithoutAuthor)
          {
            sound.AuthorId = systemUserId.Value;
          }
          soundsChanged = true;
          Logger.LogInformation($"Set system user as author for {soundsWithoutAuthor.Count} existing sounds");
        }

        // 4) Update filename if changed for valid sounds
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

      // Measure playback loudness of new sounds in the background (files are only read)
      Loudness.Start(SoundDirectory.FullName, this.Sounds.Values.Select(s => (s.Hash, s.FileName)));
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
        // In Browser mode, skip local playback - the client will stream the audio
        if (appSettings.PlaybackMode == PlaybackMode.Browser)
        {
          Logger.LogDebug($"Browser playback mode - skipping local playback for: {sound.FileName}");
        }
        else if (appSettings.SSH?.Enabled == true)
        {
          // Remote via SSH auf Raspberry Pi
          var path = SoundDirectory.FullName;
          if (Environment.EnvironmentName == "Development")
          {
            path = SoundDirectoryDebugPlay;
          }
          this.SshService.SendCmd($"mpg123 -q --no-control -f {Mpg123Scale(sound.Hash)} {path}/{sound.FileName.Replace("!", "\\!").Replace(" ", "\\ ")} &");
        }
        else
        {
          // Lokal abspielen
          var localPath = Path.Combine(SoundDirectory.FullName, sound.FileName);
          PlayLocal(localPath, Loudness.GetGain(sound.Hash));
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

        // Use full name if available, otherwise fall back to username
        var displayName = !string.IsNullOrWhiteSpace($"{initiator.FirstName}{initiator.LastName}")
          ? $"{initiator.FirstName} {initiator.LastName}".Trim()
          : initiator.Username;

        this.SoundHub.Clients.All.SendAsync("soundPlayed", new
        {
          Initiator = new { Name = displayName, Id = initiator.Id },
          Time = DateTime.UtcNow,
          SoundHash = sound.Hash,
          FileName = sound.FileName
        });

        // Check sound play achievements
        try
        {
          using (var scope = serviceProvider.CreateScope())
          {
            var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();
            // Count pending usages in queue for this user (not yet saved to DB)
            var pendingForUser = Usages.Count(u => u.UserId == userId);
            var totalPlays = db.SoundUsages.Count(su => su.UserId == userId) + pendingForUser;
            AchievementService?.CheckSoundPlayAchievements(userId, totalPlays);
          }
        }
        catch (Exception ex)
        {
          Logger.LogWarning($"Failed to check sound play achievements: {ex.Message}");
        }

      }).Start();

      return PlaySoundResult.Ok(creditsRemaining);
    }

    public bool PlayFile(string filePath)
    {
      if (appSettings.PlaybackMode != PlaybackMode.Local || appSettings.SSH?.Enabled == true) return false;
      PlayLocal(filePath);
      return true;
    }

    /// <summary>mpg123 output scale (32768 = unchanged) for the sound's normalization gain</summary>
    private int Mpg123Scale(string hash) => (int)Math.Round(32768 * (Loudness?.GetGain(hash) ?? 1.0));

    private void PlayLocal(string filePath, double gain = 1.0)
    {
      try
      {
        var player = appSettings.LocalPlayer ?? "mpg123";
        if (filePath.EndsWith(".wav", StringComparison.OrdinalIgnoreCase) && player == "mpg123")
        {
          player = "aplay"; // mpg123 cannot decode WAV
        }
        var args = player switch
        {
          "mpg123" => gain < 1.0 ? $"-q -f {(int)Math.Round(32768 * gain)} \"{filePath}\"" : $"-q \"{filePath}\"",
          "ffplay" => $"-nodisp -autoexit -loglevel quiet \"{filePath}\"",
          "cvlc" => $"--play-and-exit --quiet \"{filePath}\"",
          "aplay" => $"-q \"{filePath}\"",
          _ => $"-q \"{filePath}\""
        };

        Logger.LogDebug($"Playing locally with {player}: {filePath}");

        // No redirection (nobody reads the pipes); wait for exit so the child is reaped (no zombies).
        var proc = Process.Start(new ProcessStartInfo
        {
          FileName = player,
          Arguments = args,
          UseShellExecute = false,
          CreateNoWindow = true
        });
        if (proc != null)
        {
          _ = proc.WaitForExitAsync().ContinueWith(_ => proc.Dispose());
        }
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
          using var pkill = Process.Start(new ProcessStartInfo
          {
            FileName = "pkill",
            Arguments = $"-f {player}",
            UseShellExecute = false,
            CreateNoWindow = true
          });
          pkill?.WaitForExit(2000);
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
        Loudness?.Add(sound.Hash, sound.FileName);
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
