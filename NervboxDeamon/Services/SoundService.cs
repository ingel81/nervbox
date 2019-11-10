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

namespace NervboxDeamon.Services
{
    public interface ISoundService
    {
        void Init();
        void PlaySound(string soundId, string initiator);
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


        //member
        private Dictionary<string, Sound> Sounds { get; set; }
        private DirectoryInfo SoundDirectory { get; set; }
        private ConcurrentQueue<SoundUsage> Usages { get; set; } = new ConcurrentQueue<SoundUsage>();
        private Thread LoggingThread = null;
        private bool keepRunning = true;

        public SoundService(
          IServiceProvider serviceProvider,
          ILogger<ISoundService> logger,
          IConfiguration configuration,
          ISshService sshService,
          IHubContext<SoundHub> soundHub
          )
        {
            this.serviceProvider = serviceProvider;
            this.Logger = logger;
            this.Configuration = configuration;
            this.SshService = sshService;
            this.SoundHub = soundHub;

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

                found.Add(new { Name = name, Hash = hash, Size = fi.Length });
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

                    db.Sounds.Add(new Sound() { Allowed = true, Hash = newSound.Hash, FileName = newSound.Name, Valid = true, Size = newSound.Size });
                    soundsChanged = true;
                }

                //3) für die validen soduns den Namen Updaten falls geändert
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

        public void PlaySound(string soundId, string initiator)
        {
            new Task(() =>
            {
                var sound = this.Sounds[soundId];
                this.SshService.SendCmd($"omxplayer -o local --no-keys {Path.Combine(SoundDirectory.FullName, sound.FileName.Replace("!", "\\!").Replace(" ", "\\ "))} &");

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
                    Initiator = initiator,
                    Time = DateTime.UtcNow,
                    SoundHash = sound.Hash
                };

                this.Usages.Enqueue(usage);
                this.SoundHub.Clients.All.SendAsync("soundPlayed", new
                {
                    Initiator = initiator,
                    Time = DateTime.UtcNow,
                    SoundHash = sound.Hash,
                    FileName = sound.FileName
                });

            }).Start();
        }

        public void KillAll()
        {
            this.SshService.SendCmd($"sudo pkill -f omxplayer");
        }

    }
}
