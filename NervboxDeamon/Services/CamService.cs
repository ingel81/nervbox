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
using System.Net.Http;
using System.Drawing;

namespace NervboxDeamon.Services
{
  public interface ICamService
  {
    void Init();
    byte[] GetCurrentImageBytes();
    void Move(string direction, int userId);
  }

  public class CamService : ICamService
  {
    //injected
    private readonly ILogger<ICamService> Logger;
    private readonly IConfiguration Configuration;
    private readonly IServiceProvider serviceProvider;
    private ISshService SshService { get; }
    private readonly IHubContext<CamHub> CamHub;
    private IWebHostEnvironment Environment { get; }
    private AppSettings AppSettings { get; }

    //member
    private Thread CamThread { get; set; }
    private bool keepRunning = true;
    private Image currentImage = null;
    private byte[] currentImageBytes = null;
    private object lockObject = new object();


    public CamService(
      IServiceProvider serviceProvider,
      ILogger<ICamService> logger,
      IConfiguration configuration,
      ISshService sshService,
      IHubContext<CamHub> camHub,
      IWebHostEnvironment environment
      )
    {
      this.serviceProvider = serviceProvider;
      this.Logger = logger;
      this.Configuration = configuration;
      this.SshService = sshService;
      this.CamHub = camHub;
      this.Environment = environment;

      this.AppSettings = Configuration.GetSection("AppSettings").Get<AppSettings>();
    }

    public byte[] GetCurrentImageBytes()
    {
      lock (lockObject)
      {
        byte[] tarr = new byte[this.currentImageBytes.Length];
        this.currentImageBytes.CopyTo(tarr, 0);
        return tarr;
      }
    }

    private CredentialCache credCache { get; set; }

    public void Init()
    {

      this.CamThread = new Thread(() =>
      {
        this.credCache = new CredentialCache();
        this.credCache.Add(new Uri($"http://{AppSettings.Camera1.Host}:{AppSettings.Camera1.Port}/"), "Digest", new NetworkCredential(AppSettings.Camera1.User, AppSettings.Camera1.Password));
        var client = new HttpClient(new HttpClientHandler { Credentials = credCache });

        while (keepRunning)
        {
          try
          {
            var response = client.GetAsync($"http://{AppSettings.Camera1.Host}:{AppSettings.Camera1.Port}/mjpeg/snap.cgi?chn=0").GetAwaiter().GetResult();
            this.currentImage = Image.FromStream(response.Content.ReadAsStreamAsync().GetAwaiter().GetResult());

            lock (lockObject)
            {
              this.currentImageBytes = ImageToByteArray(this.currentImage);
            }

            this.CamHub.Clients.All.SendAsync("imageCaptured", new
            {
              status = true
            });
          }
          catch (Exception ex)
          {
            this.Logger.LogError("Error capturing image: {ex}", ex);
          }
          finally
          {
            Thread.Sleep(50);
          }
        }
      });

      this.CamThread.Start();
    }

    public void Move(string direction, int userId)
    {
      var client = new HttpClient(new HttpClientHandler { Credentials = credCache });

      //ipaddr/hy-cgi/ptz.cgi?cmd=ptzctrl&act=left|right|up|down|stop|home|hscan|vscan 
      var request = new HttpRequestMessage(HttpMethod.Get, $"http://{AppSettings.Camera1.Host}:{AppSettings.Camera1.Port}/hy-cgi/ptz.cgi?cmd=ptzctrl&act={direction}");
      request.Headers.Add("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9");
      request.Headers.Add("Accept-Encoding", "gzip, deflate");
      request.Headers.Add("Accept-Language", "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7,nb;q=0.6");
      request.Headers.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.88 Safari/537.36");
      var response = client.SendAsync(request).GetAwaiter().GetResult();
      if (!response.IsSuccessStatusCode)
      {
        this.Logger.LogError(response.Content.ReadAsStringAsync().GetAwaiter().GetResult());
      }
    }

    private byte[] ImageToByteArray(System.Drawing.Image imageIn)
    {
      MemoryStream ms = new MemoryStream();
      imageIn.Save(ms, System.Drawing.Imaging.ImageFormat.Jpeg);
      return ms.ToArray();
    }

  }
}
