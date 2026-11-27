using System;
using System.IO;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Serilog;
using Serilog.Events;

namespace NervboxDeamon
{
  public class Program
  {
    public static int Main(string[] args)
    {
      // Serilog Bootstrap-Logger für Startfehler
      Log.Logger = new LoggerConfiguration()
          .MinimumLevel.Override("Microsoft", LogEventLevel.Information)
          .Enrich.FromLogContext()
          .WriteTo.Console()
          .CreateBootstrapLogger();

      try
      {
        Log.Information("Starting NervboxDeamon");
        CreateHostBuilder(args).Build().Run();
        return 0;
      }
      catch (Exception ex)
      {
        Log.Fatal(ex, "Host terminated unexpectedly");
        return 1;
      }
      finally
      {
        Log.CloseAndFlush();
      }
    }

    public static IHostBuilder CreateHostBuilder(string[] args)
    {
      var contentRoot = Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);

      return Host.CreateDefaultBuilder(args)
          .ConfigureAppConfiguration((hostingContext, config) =>
          {
            // Lade appsettings.Local.json (nicht eingecheckt, für API-Keys etc.)
            config.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true);
          })
          .UseSerilog((ctx, services, cfg) =>
          {
            // Explicit assemblies: without them Serilog scans the app folder for Serilog*.dll and
            // crashes on stale DLLs left over from older builds (deploy never deletes on the Pi).
            var serilogOptions = new Serilog.Settings.Configuration.ConfigurationReaderOptions(
                typeof(ConsoleLoggerConfigurationExtensions).Assembly);
            cfg.ReadFrom.Configuration(ctx.Configuration, serilogOptions)
               .Enrich.FromLogContext()
               .Enrich.WithProperty("Application", "NervboxDeamon")
               .WriteTo.Console(
                   outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj}{NewLine}{Exception}",
                   theme: Serilog.Sinks.SystemConsole.Themes.AnsiConsoleTheme.Code);
          })
          // systemd gives us 5 s (TimeoutStopSec). Open SignalR/long-polling connections would make
          // Kestrel wait for the default 30 s, so cap graceful shutdown well below that.
          .ConfigureServices(services =>
              services.Configure<HostOptions>(o => o.ShutdownTimeout = TimeSpan.FromSeconds(3)))
          .ConfigureWebHostDefaults(webBuilder =>
          {
            webBuilder
                .UseContentRoot(contentRoot)
                .UseStartup<Startup>()
                .UseWebRoot("wwwroot")
                .ConfigureKestrel((context, options) =>
                {
                  options.AllowSynchronousIO = true;
                });
          });
    }
  }
}
