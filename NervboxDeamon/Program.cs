using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Serilog;
using Serilog.Events;
using Serilog.Formatting.Compact;
using Serilog.Formatting.Json;
using Serilog.Sinks.SystemConsole.Themes;
using NervboxDeamon.Helpers;
using NervboxDeamon.Models.Settings;

namespace NervboxDeamon
{
  public class Program
  {
    public static void Main(string[] args)
    {
      CreateWebHostBuilder(args).Build().Run();
    }

    public static IWebHostBuilder CreateWebHostBuilder(string[] args)
    {

      return WebHost.CreateDefaultBuilder(args)
          //.UseSerilog((ctx, cfg) =>
          //  {
          //    Serilog.Debugging.SelfLog.Enable(msg => Console.WriteLine(msg));

          //    var logPath = ctx.Configuration.GetSection("AppSettings").Get<AppSettings>().LogPath;

          //    Console.WriteLine(string.Format("logs are written to: {0}", logPath));

          //    cfg.ReadFrom.Configuration(ctx.Configuration)
          //    //.WriteTo.RollingFile(logPath, outputTemplate: "[{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} {Level:u3}] {SourceContext}: {Message:lj}{NewLine}{Exception}")              
          //    //.WriteTo.RollingFile(new CompactJsonFormatter(), logPath)
          //    .WriteTo.RollingFile(new CompactJsonFormatter(), logPath)
          //    .Enrich.FromLogContext()
          //    .WriteTo.Console(outputTemplate: "[{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} {Level:u3}] {SourceContext}: {Message:lj}{NewLine}{Exception}");
          //  }
          //)
          .UseContentRoot(Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location))
          .UseStartup<Startup>().UseUrls("http://0.0.0.0:8080")
          .UseWebRoot("wwwroot")
          .ConfigureKestrel((context, options) =>
          {
            options.AllowSynchronousIO = true;
          });
    }
  }
}
