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
using Microsoft.AspNetCore.Hosting;

namespace NervboxDeamon.Services
{
  public interface ISoundService
  {
    void Init();
    void PlaySound(string soundId, int userId);
    void TTS(string text, int userId);
    void KillAll();
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

    //member
    public ConcurrentDictionary<int, User> UserLookup { private set; get; } = new ConcurrentDictionary<int, User>();
    private Dictionary<string, Sound> Sounds { get; set; }
    private DirectoryInfo SoundDirectory { get; set; }
    private DirectoryInfo TTSDirectory { get; set; }
    private string SoundDirectoryDebugPlay { get; set; }
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

      var appSettingsSection = Configuration.GetSection("AppSettings");
      var appSettings = appSettingsSection.Get<AppSettings>();

      if (Environment.EnvironmentName == "Development")
      {
        SoundDirectoryDebugPlay = appSettings.SoundPathDebugPlay;
      }

      SoundDirectory = new DirectoryInfo(appSettings.SoundPath);
      TTSDirectory = new DirectoryInfo(appSettings.TTSPath);

      var soundFiles = SoundDirectory.GetFiles();
      List<dynamic> found = new List<dynamic>();

      foreach (FileInfo fi in soundFiles)
      {
        string hash = string.Empty;
        string name = fi.Name;

        using (var md5 = MD5.Create())
        {
          using (var stream = File.OpenRead(fi.FullName))
          {
            var hBytes = md5.ComputeHash(stream);
            hash = BitConverter.ToString(hBytes).Replace("-", "").ToLowerInvariant();
          }
        }

        //check meta data:
        var file = TagLib.File.Create(fi.FullName);
        TimeSpan duration = file.Properties.Duration;

        found.Add(new { Name = name, Hash = hash, Size = fi.Length, Duration = duration });
      }

      using (var scope = serviceProvider.CreateScope())
      {
        bool soundsChanged = false;

        var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();
        var existing = db.Sounds.ToList();

        var validSounds = existing.Where(e => found.Exists(f => e.Hash.Equals(f.Hash))).ToList();
        var invalidSounds = existing.Where(e => !(found.Exists(f => e.Hash.Equals(f.Hash)))).ToList();
        var newSounds = found.Where(f => !existing.Exists(e => e.Hash.Equals(f.Hash))).ToList();

        var conflicts = new Dictionary<string, dynamic>();

        // 1) delete removed sounds
        foreach (var invalidSound in invalidSounds)
        {
          invalidSound.Valid = false;
          soundsChanged = true;
        }

        // 2) neue sounds inserten
        foreach (var newSound in newSounds)
        {
          try
          {
            db.Sounds.Add(new Sound() { Allowed = true, Hash = newSound.Hash, FileName = newSound.Name, Valid = true, Size = newSound.Size, Duration = newSound.Duration });
            soundsChanged = true;
          }
          catch (Exception ex)
          {
            Logger.LogDebug($"Cant add sound with hash {newSound.Hash} and Filename {newSound.Name}. Exception was {ex}");
          }
        }

        //3) für die validen soduns den Namen Updaten falls geändert
        foreach (var sound in validSounds)
        {
          try
          {
            var foundSound = found.Where(f => f.Hash.Equals(sound.Hash)).Single();

            if (!foundSound.Name.Equals(sound.FileName))
            {
              sound.FileName = foundSound.Name;

              soundsChanged = true;
            }
          }
          catch (Exception)
          {
            var foundSounds = found.Where(f => f.Hash.Equals(sound.Hash)).ToList();
          }
        }

        if (soundsChanged)
        {
          db.SaveChanges();
        }

        //load all
        this.Sounds = db.Sounds.ToDictionary(s => s.Hash, s => s);
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

    public void TTS(string text, int userId)
    {
      // pico2wave - w affe.wav -l "de-DE" "<pitch level='80'><volume level='200'>kaffe fertig" && aplay affe.wav
	  
	  // besser:
	  // espeak -p 100 -a 1000 -vde "fickt, ficken, gefickt, fick" -w affe.wav && omxplayer affe.wav

      new Task(() =>
      {
        var path = TTSDirectory.FullName;
        var id = Guid.NewGuid().ToString("N");
        var randFile = Path.Combine(path, $"{id}.wav");

        this.SshService.SendCmd($"pico2wave -w {randFile} -l \"de-DE\" \"<pitch level='80'><volume level='200'>{text.Trim()}\" && aplay {randFile}");
      }).Start();
    }

    public void PlaySound(string soundId, int userId)
    {
      new Task(() =>
      {
        var path = SoundDirectory.FullName;
        if (Environment.EnvironmentName == "Development")
        {
          path = SoundDirectoryDebugPlay;
        }

        var sound = this.Sounds[soundId];
        //this.SshService.SendCmd($"omxplayer -o local --no-keys {path}/{sound.FileName.Replace("!", "\\!").Replace(" ", "\\ ")} &");
        this.SshService.SendCmd($"mpg123 -q --no-control {path}/{sound.FileName.Replace("!", "\\!").Replace(" ", "\\ ")} &");

        //try
        //{
        //  IPHostEntry e = Dns.GetHostEntry(initiator);
        //  if (e != null)
        //  {
        //    initiator = $"{e.HostName} ({initiator})";
        //  }
        //}
        //catch { }

        var usage = new SoundUsage()
        {
          PlayedByUserId = userId,
          Time = DateTime.UtcNow,
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
    }

    public void KillAll()
    {
      this.SshService.SendCmd($"sudo pkill -f mpg123");
      this.SshService.SendCmd($"sudo pkill -f omxplayer");
      this.SshService.SendCmd($"sudo pkill -f aplay");
    }

  }
}
