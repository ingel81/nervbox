using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using NervboxDeamon.Models.Settings;
using NervboxDeamon.Services.Interfaces;

namespace NervboxDeamon.Services
{
  public interface ISocketAPIService
  {
    void Init();
  }

  /// <summary>
  /// Stellt eine Socketschnittstelle bereit um Moduldaten direkt über ETH abzugreifen
  /// </summary>
  public class SocketAPIService : ISocketAPIService
  {
    //injected
    private readonly ILogger<SocketAPIService> Logger;
    private readonly IConfiguration Configuration;
    private readonly INervboxModuleService NervboxModuleService;

    private readonly IHostApplicationLifetime ApplicationLifetime;

    //member
    public static ManualResetEvent allDone = new ManualResetEvent(false);
    private Thread socketThread;
    private bool keepRunning = true;

    [Obsolete]
    public SocketAPIService(
      ILogger<SocketAPIService> logger,
      IConfiguration configuration,
      INervboxModuleService nervboxModuleService,
      IHostApplicationLifetime appLifetime)
    {
      this.Logger = logger;
      this.Configuration = configuration;
      this.NervboxModuleService = nervboxModuleService;
      this.ApplicationLifetime = appLifetime;

      ApplicationLifetime.ApplicationStopping.Register(() =>
      {
        this.Stop();
      });
    }

    public void Init()
    {
      socketThread = new Thread(() =>
      {
        StartListening();
      });

      if (Configuration.GetSection("AppSettings").Get<AppSettings>().SocketAPI.Enabled)
      {
        socketThread.Start();
      }
    }

    public void Stop()
    {
      this.Logger.LogDebug("stopping...");
      this.keepRunning = false;
      allDone.Set();

      if (Configuration.GetSection("AppSettings").Get<AppSettings>().SocketAPI.Enabled)
      {
        socketThread.Join();
      }

      this.Logger.LogDebug("stopped");
    }

    private void StartListening()
    {
      IPHostEntry ipHostInfo = Dns.GetHostEntry(Dns.GetHostName());
      IPAddress ipAddress = ipHostInfo.AddressList[0];
      IPEndPoint localEndPoint = new IPEndPoint(IPAddress.Any, 11000);
      Socket listener = new Socket(SocketType.Stream, ProtocolType.Tcp);

      try
      {
        listener.Bind(localEndPoint);
        listener.Listen(100);

        while (keepRunning)
        {
          allDone.Reset();

          // Start an asynchronous socket to listen for connections.
          this.Logger.LogDebug("Waiting for a connection...");
          listener.BeginAccept(new AsyncCallback(AcceptCallback), listener);

          // Wait until a connection is made before continuing.  
          allDone.WaitOne();
        }
      }
      catch (Exception e)
      {
        this.Logger.LogError($"Error starting socket server: {e}");
      }
    }

    private void AcceptCallback(IAsyncResult ar)
    {
      // Signal the main thread to continue.  
      allDone.Set();

      // Get the socket that handles the client request.  
      Socket listener = (Socket)ar.AsyncState;
      Socket handler = listener.EndAccept(ar);

      // Create the state object.  
      StateObject state = new StateObject
      {
        workSocket = handler
      };

      // Start receiving
      handler.BeginReceive(state.buffer, 0, StateObject.BufferSize, 0, new AsyncCallback(ReadCallback), state);
    }

    private void ReadCallback(IAsyncResult ar)
    {
      try
      {
        String content = String.Empty;
        StateObject state = (StateObject)ar.AsyncState;
        Socket handler = state.workSocket;
        int bytesRead = handler.EndReceive(ar);

        if (bytesRead > 0)
        {
          // There  might be more data, so store the data received so far.  
          state.sb.Append(Encoding.ASCII.GetString(state.buffer, 0, bytesRead));

          // Check for determinator
          content = state.sb.ToString();
          if (content.IndexOf(";") > -1)
          {
            // complete command received
            state.buffer = new byte[1024];
            state.sb.Clear();

            this.Logger.LogDebug("Read {0} bytes from socket. \n Data : {1}", content.Length, content);
            string response = string.Empty;

            switch (content)
            {
              case "$lc;":
                response += $"lc:";

                if (this.NervboxModuleService.LatestMeasure == null)
                {
                  response += $"error002=No cycle since boot;";
                }
                else
                {
                  response += $"dt={this.NervboxModuleService.LatestMeasure.Time.ToString("yyyyMMddHHmmssfff")}|";
                  response += $"a={this.NervboxModuleService.LatestMeasure.Acceleration.ToString("0.000", CultureInfo.InvariantCulture)}|";
                  response += $"i={this.NervboxModuleService.LatestMeasure.Current.ToString("0.000", CultureInfo.InvariantCulture)}|";
                  response += $"t1={this.NervboxModuleService.LatestMeasure.Temperature1.ToString("0.000", CultureInfo.InvariantCulture)}|";
                  response += $"t2={this.NervboxModuleService.LatestMeasure.Temperature2.ToString("0.000", CultureInfo.InvariantCulture)}|";
                  response += $"t3={this.NervboxModuleService.LatestMeasure.Temperature3.ToString("0.000", CultureInfo.InvariantCulture)}|";
                  response += $"tb={this.NervboxModuleService.LatestMeasure.TemperatureB.ToString("0.000", CultureInfo.InvariantCulture)}|";
                  response += $"ct={this.NervboxModuleService.LatestMeasure.CyclesSinceDelivery}|";
                  response += $"cm={this.NervboxModuleService.LatestMeasure.CyclesSinceMaintenance}|";
                  response += $"cc={this.NervboxModuleService.LatestMeasure.CyclesSinceCleaning}";
                  response += $";";
                }
                break;

              case "$live;":
                response += $"live:";
                var measures = this.NervboxModuleService.Action_GetCurrentMeasureValues();

                if (measures == null && measures.Count > 0)
                {
                  response += $"error003=No measures received;";
                }
                else
                {
                  var values = new List<string>();
                  foreach (var key in measures.Keys)
                  {
                    if (measures[key] is double)
                    {
                      values.Add($"{key}={((double)measures[key]).ToString("0.000", CultureInfo.InvariantCulture)}");
                    }
                    else if (measures[key] is long)
                    {
                      values.Add($"{key}={((long)measures[key]).ToString()}");
                    }
                  }

                  response += string.Join("|", values);
                  response += $";";
                }

                break;

              default:
                response = "error001=Unrecognized Command;";
                break;
            }

            Send(handler, response, state);
          }
          else
          {
            // Not all data received. Get more.  
            handler.BeginReceive(state.buffer, 0, StateObject.BufferSize, 0, new AsyncCallback(ReadCallback), state);
          }
        }
      }
      catch (Exception ex)
      {
        this.Logger.LogDebug($"Readcallback error: {ex}");
      }
    }

    private void Send(Socket handler, String data, StateObject state)
    {
      this.Logger.LogDebug($"Sending {data}");
      byte[] byteData = Encoding.ASCII.GetBytes(data);
      handler.BeginSend(byteData, 0, byteData.Length, 0, new AsyncCallback(SendCallback), state);
    }

    private void SendCallback(IAsyncResult ar)
    {
      try
      {
        StateObject state = (StateObject)ar.AsyncState;
        int bytesSent = state.workSocket.EndSend(ar);
        this.Logger.LogDebug("Sent {0} bytes to client.", bytesSent);

        state.workSocket.BeginReceive(state.buffer, 0, StateObject.BufferSize, 0, new AsyncCallback(ReadCallback), state);
      }
      catch (Exception e)
      {
        this.Logger.LogDebug($"Sendcallback error: {e}");
      }
    }
  }

  public class StateObject
  {

    public Socket workSocket = null;
    public const int BufferSize = 1024;
    public byte[] buffer = new byte[BufferSize];
    public StringBuilder sb = new StringBuilder();
  }
}
