using System;
using System.IO;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Hosting;
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
          .UseSerilog((ctx, services, cfg) =>
          {
            cfg.ReadFrom.Configuration(ctx.Configuration)
               .Enrich.FromLogContext()
               .Enrich.WithProperty("Application", "NervboxDeamon")
               .WriteTo.Console(
                   outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj}{NewLine}{Exception}",
                   theme: Serilog.Sinks.SystemConsole.Themes.AnsiConsoleTheme.Code);
          })
          .ConfigureWebHostDefaults(webBuilder =>
          {
            webBuilder
                .UseContentRoot(contentRoot)
                .UseStartup<Startup>()
                .UseUrls("http://0.0.0.0:8080")
                .UseWebRoot("wwwroot")
                .ConfigureKestrel((context, options) =>
                {
                  options.AllowSynchronousIO = true;
                });
          });
    }
  }
}
