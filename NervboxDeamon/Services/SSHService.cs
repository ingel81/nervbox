using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Renci.SshNet;
using Renci.SshNet.Common;
using NervboxDeamon.Helpers;
using System.Text;
using System.IO;
using Microsoft.AspNetCore.SignalR;
using NervboxDeamon.Hubs;
using System.Threading;
using NervboxDeamon.Models.Settings;

namespace NervboxDeamon.Services
{
  public interface ISshService
  {
    void Init();
    void SendCmd(string cmdText);
    string SendReadCmd(string cmdText, out string error, out int existStatus, double timeoutMs = 5000d);
  }

  /// <summary>
  /// Stell div. Möglichkeit bereit via SSH mit dem System zu kommunizieren
  /// </summary>
  public class SSHService : ISshService
  {
    //injected
    private readonly ILogger<SSHService> Logger;
    private readonly IConfiguration Configuration;
    private readonly IHubContext<SshHub> SshHub;

    //member
    private readonly object shellLock = new object();
    private SshClient client = null;
    private ShellStream shell = null;
    private Thread sshThread;
    private bool keepRunning = true;

    public SSHService(
      ILogger<SSHService> logger,
      IConfiguration configuration,
      IHubContext<SshHub> sshHub
      )
    {
      this.Logger = logger;
      this.Configuration = configuration;
      this.SshHub = sshHub;

      keepRunning = true;
    }

    public void Init()
    {
      var appSettings = Configuration.GetSection("AppSettings").Get<AppSettings>();

      if (!appSettings.SSH.Enabled)
      {
        this.Logger.LogInformation($"SSH connection disabled in config.");
        return;
      }

      client = new SshClient(appSettings.SSH.Host, appSettings.SSH.Port, appSettings.SSH.User, appSettings.SSH.Password);
      client.Connect();

      shell = client.CreateShellStream("", 80, 80, 80, 40, 1024);
      shell.DataReceived += Shell_DataReceived;
      sshThread = new Thread(() =>
      {
        this.Logger.LogInformation($"SSH connection to {appSettings.SSH.Host}:{appSettings.SSH.Port} established.");
        while (keepRunning)
        {
          Thread.Sleep(500);
        }
      });

      sshThread.Start();
    }

    private void Shell_DataReceived(object sender, ShellDataEventArgs e)
    {
      this.SshHub.Clients.All.SendAsync("newSshMessage", Encoding.UTF8.GetString(e.Data));
    }

    public void SendCmd(string cmdText)
    {
      lock (shellLock)
      {
        shell.WriteLine(cmdText);
      }
    }

    public string SendReadCmd(string cmdText, out string error, out int existStatus, double timeoutMs = 5000d)
    {
      lock (shellLock)
      {
        var cmd = client.CreateCommand(cmdText);
        cmd.CommandTimeout = TimeSpan.FromMilliseconds(timeoutMs);

        var response = cmd.Execute();

        error = cmd.Error;
        existStatus = cmd.ExitStatus;
        return response;
      }
    }

  }
}
