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
          .UseSerilog((ctx, cfg) =>
            {
              Serilog.Debugging.SelfLog.Enable(msg => Console.WriteLine(msg));

              var logPath = ctx.Configuration.GetSection("AppSettings")["LogPath"];

              Console.WriteLine(string.Format("logs are written to: {0}", logPath));

              cfg.ReadFrom.Configuration(ctx.Configuration)
              .WriteTo.RollingFile(logPath, outputTemplate: "[{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} {Level:u3}] {SourceContext}: {Message:lj}{NewLine}{Exception}")
              .Enrich.FromLogContext()
              .WriteTo.Console();
            }
          ).UseStartup<Startup>().UseUrls("http://0.0.0.0:8080");
    }
  }
}
