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

namespace NervboxDeamon.Services
{
  public interface ISoundService
  {
    void Init();
    void PlaySound(string soundId);
  }

  public class SoundService : ISoundService
  {
    //injected
    private readonly ILogger<ISoundService> Logger;
    private readonly IConfiguration Configuration;
    private readonly IServiceProvider serviceProvider;
    private ISshService SshService { get; }

    //member
    private Dictionary<string, Sound> Sounds { get; set; }
    private DirectoryInfo SoundDirectory { get; set; }

    public SoundService(
      IServiceProvider serviceProvider,
      ILogger<ISoundService> logger,
      IConfiguration configuration,
      ISshService sshService
      )
    {
      this.serviceProvider = serviceProvider;
      this.Logger = logger;
      this.Configuration = configuration;
      this.SshService = sshService;
    }

    public void Init()
    {
      var appSettingsSection = Configuration.GetSection("AppSettings");
      var appSettings = appSettingsSection.Get<AppSettings>();
      SoundDirectory = new DirectoryInfo(appSettings.SoundPath);

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

        found.Add(new { Name = name, Hash = hash });
      }

      using (var scope = serviceProvider.CreateScope())
      {
        bool soundsChanged = false;

        var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();
        var existing = db.Sounds.ToList();

        var validSounds = existing.Where(e => found.Exists(f => e.Hash.Equals(f.Hash))).ToList();
        var invalidSounds = existing.Where(e => !(found.Exists(f => e.Hash.Equals(f.Hash)))).ToList();
        var newSounds = found.Where(f => !existing.Exists(e => e.Hash.Equals(f.Hash))).ToList();

        // 1) delete removed sounds
        foreach (var invalidSound in invalidSounds)
        {
          invalidSound.Valid = false;
          soundsChanged = true;
        }

        // 2) neue sounds inserten
        foreach (var newSound in newSounds)
        {

          db.Sounds.Add(new Sound() { Allowed = true, Hash = newSound.Hash, FileName = newSound.Name, Valid = true });
          soundsChanged = true;
        }

        // 3) für die validen soduns den Namen Updaten falls geändert
        foreach (var sound in validSounds)
        {
          var foundSound = found.Where(f => f.Hash.Equals(sound.Hash)).Single();

          if (!foundSound.Name.Equals(sound.FileName))
          {
            sound.FileName = foundSound.Name;
            soundsChanged = true;
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

    public void PlaySound(string soundId)
    {
      var sound = this.Sounds[soundId];
      //var affe = this.SshService.SendReadCmd($"sudo omxplayer --no-keys -o local {Path.Combine(SoundDirectory.FullName, sound.FileName)} &", out string error, out int exitStatus);
      this.SshService.SendCmd($"omxplayer -o local --no-keys {Path.Combine(SoundDirectory.FullName, sound.FileName.Replace("!", "\\!").Replace(" ", "\\ "))} &");
    }

  }
}
