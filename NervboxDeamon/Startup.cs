using System;
using System.Linq;
using System.IO;
using System.Text;
using System.Net.Http;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;
using NervboxDeamon.Hubs;
using NervboxDeamon.Models.Settings;
using NervboxDeamon.Services;
using Newtonsoft.Json.Converters;
using NervboxDeamon.Services.Interfaces;
using Microsoft.AspNetCore.HttpOverrides;
using Yarp.ReverseProxy.Forwarder;
using Microsoft.AspNetCore.ResponseCompression;
using Serilog;
using Microsoft.AspNetCore.StaticFiles;
using System.IO.Compression;
using System.Text.RegularExpressions;

#nullable enable

namespace NervboxDeamon
{
  public class Startup
  {
    private ILogger<Startup>? _logger;
    public IConfiguration Configuration { get; }

    public Startup(IConfiguration configuration)
    {
      Configuration = configuration;

      AppDomain.CurrentDomain.ProcessExit += (s, e) =>
      {
        _logger?.LogInformation("Going down");
      };

      //default serializer settings
      JsonConvert.DefaultSettings = () =>
      {
        var settings = new JsonSerializerSettings
        {
          Formatting = Formatting.Indented,
          ContractResolver = new CamelCasePropertyNamesContractResolver(),
        };
        settings.Converters.Add(new Newtonsoft.Json.Converters.StringEnumConverter());

        return settings;
      };
    }

    // This method gets called by the runtime. Use this method to add services to the container.
    public void ConfigureServices(IServiceCollection services)
    {
      // Configure SQLite with path from AppSettings
      var appSettingsSection = Configuration.GetSection("AppSettings");
      var appSettings = appSettingsSection.Get<AppSettings>()
          ?? throw new InvalidOperationException("AppSettings section is missing in configuration");
      var dbPath = appSettings.DatabasePath ?? "nervbox.db";

      services.AddDbContext<NervboxDBContext>(options =>
          options.UseSqlite($"Data Source={dbPath}"));

      services.AddCors(options => options.AddPolicy("CorsPolicy", builder =>
      {
        builder
            .AllowAnyMethod()
            .AllowAnyHeader()
            .SetIsOriginAllowed(_ => true)  // Erlaubt alle Origins mit Credentials
            .AllowCredentials();
      }));

      services.AddSignalR().AddNewtonsoftJsonProtocol(options =>
      {
        options.PayloadSerializerSettings.Converters.Add(new StringEnumConverter());
      });

      services.AddMvc(o =>
      {
              //o.EnableEndpointRouting = false;
            }).AddNewtonsoftJson(options =>
            {
              options.SerializerSettings.Converters.Add(new Newtonsoft.Json.Converters.StringEnumConverter());
              options.SerializerSettings.NullValueHandling = Newtonsoft.Json.NullValueHandling.Ignore;
            });

      // configure strongly typed settings objects
      services.Configure<AppSettings>(appSettingsSection);

      // configure jwt authentication
      var key = Encoding.ASCII.GetBytes(appSettings.Secret);

      services.AddAuthentication(x =>
      {
        x.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        x.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
      })
      .AddJwtBearer(x =>
      {

        x.RequireHttpsMetadata = false;
        x.SaveToken = true;
        x.TokenValidationParameters = new TokenValidationParameters
        {
          ValidateIssuerSigningKey = true,
          IssuerSigningKey = new SymmetricSecurityKey(key),
          ValidateIssuer = false,
          ValidateAudience = false
        };
        // WebSockets/SSE cannot send an Authorization header: SignalR passes the JWT as
        // ?access_token=... Without this the hub upgrade was anonymous -> 403 after an
        // authenticated negotiate, and the chat fell back to long polling.
        x.Events = new JwtBearerEvents
        {
          OnMessageReceived = context =>
          {
            var accessToken = context.Request.Query["access_token"];
            if (!string.IsNullOrEmpty(accessToken) && context.HttpContext.Request.Path.StartsWithSegments("/ws"))
            {
              context.Token = accessToken;
            }
            return System.Threading.Tasks.Task.CompletedTask;
          }
        };
      });

      // configure DI for application services
      services.AddSingleton<IHttpContextAccessor, HttpContextAccessor>();
      services.AddScoped<IUserService, UserService>();
      services.AddSingleton<ISettingsService, SettingsService>();
      services.AddSingleton<ISshService, SSHService>();
      services.AddSingleton<ISystemService, SystemService>();
      services.AddSingleton<ISoundService, SoundService>();
      services.AddSingleton<IGiphyService, GiphyService>();
      services.AddSingleton<ICreditService, CreditService>();
      services.AddSingleton<IAchievementService, AchievementService>();
      services.AddSingleton<IVoteService, VoteService>();
      services.AddSingleton<IShopService, ShopService>();
      services.Configure<IISServerOptions>(options =>
      {
        options.AllowSynchronousIO = true;
      });

      // HTTPS Redirect konfigurieren (nur Production)
      services.AddHttpsRedirection(options =>
      {
        options.RedirectStatusCode = StatusCodes.Status308PermanentRedirect;
        options.HttpsPort = 443; // Externer Port (nftables leitet 443 → 8443)
      });

      // Compress text responses (bundles, JSON). Fastest level: the Pi's CPU matters more than a few kB.
      services.AddResponseCompression(options =>
      {
        options.EnableForHttps = true;
        options.Providers.Add<BrotliCompressionProvider>();
        options.Providers.Add<GzipCompressionProvider>();
        options.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat(new[] { "image/svg+xml", "application/manifest+json" });
      });
      services.Configure<BrotliCompressionProviderOptions>(o => o.Level = CompressionLevel.Fastest);
      services.Configure<GzipCompressionProviderOptions>(o => o.Level = CompressionLevel.Fastest);

      // Add HTTP Forwarder for dev proxy
      services.AddHttpForwarder();
    }

    // This method gets called by the runtime. Use this method to configure the HTTP request pipeline.
    public void Configure(IApplicationBuilder app, IWebHostEnvironment env, ILogger<Startup> logger)
    {
      _logger = logger;
      _logger.LogInformation("Configuring NervboxDeamon");

      app.UseForwardedHeaders(new ForwardedHeadersOptions
      {
        ForwardedHeaders = ForwardedHeaders.All
      });

      // One log line per API call (static files, sound/avatar downloads and websockets only at Debug).
      app.UseSerilogRequestLogging(options =>
      {
        options.MessageTemplate = "HTTP {RequestMethod} {RequestPath} -> {StatusCode} in {Elapsed:0} ms";
        options.GetLevel = (ctx, elapsed, ex) =>
        {
          if (ex != null || ctx.Response.StatusCode >= 500) return Serilog.Events.LogEventLevel.Error;
          var path = ctx.Request.Path.Value ?? "";
          var isApi = path.StartsWith("/api", StringComparison.OrdinalIgnoreCase);
          var isFile = path.EndsWith("/file", StringComparison.OrdinalIgnoreCase) || path.EndsWith("/avatar", StringComparison.OrdinalIgnoreCase);
          return isApi && !isFile ? Serilog.Events.LogEventLevel.Information : Serilog.Events.LogEventLevel.Debug;
        };
      });

      app.UseResponseCompression();

      // Apply database migrations
      try
      {
        UpdateDatabase(app);
      }
      catch (Exception ex)
      {
        _logger.LogCritical(ex, "Failed to migrate database");
      }

      if (env.EnvironmentName == "Development")
      {
        app.UseDeveloperExceptionPage();
      }
      else if (env.EnvironmentName == "Production")
      {
        // Production (Pi): HTTP → HTTPS Redirect (SSL terminated by Kestrel)
        app.UseHttpsRedirection();
      }
      // Docker: No HTTPS redirect - SSL is terminated by Cloudflare/reverse proxy

      // global cors policy
      app.UseCors("CorsPolicy");

      app.UseRouting();

      app.UseAuthentication();
      app.UseAuthorization();

      app.UseEndpoints(endpoints =>
      {
        endpoints.MapHub<SoundHub>("/ws/soundHub");
        endpoints.MapHub<SshHub>("/ws/sshHub");
        endpoints.MapHub<ChatHub>("/ws/chatHub");
        endpoints.MapControllerRoute("default", "{controller=Home}/{action=Index}/{id?}");
      });

      // ========== FRONTEND ROUTING ==========
      // /       -> Player App (dev: DevProxy:PlayerUrl, prod: wwwroot)
      // /mixer  -> Mixer App (dev: DevProxy:MixerUrl, prod: wwwroot/mixer)

      if (env.EnvironmentName == "Development")
      {
        // Dev mode: Proxy to Angular dev servers
        var httpClient = new HttpMessageInvoker(new SocketsHttpHandler()
        {
          UseProxy = false,
          AllowAutoRedirect = false,
          AutomaticDecompression = System.Net.DecompressionMethods.None,
          UseCookies = false,
          EnableMultipleHttp2Connections = true,
          PooledConnectionIdleTimeout = TimeSpan.FromMinutes(2),
          PooledConnectionLifetime = TimeSpan.FromMinutes(15),
        });

        var forwarder = app.ApplicationServices.GetRequiredService<IHttpForwarder>();
        var playerUrl = Configuration["DevProxy:PlayerUrl"] ?? "http://localhost:4711";
        var mixerUrl = Configuration["DevProxy:MixerUrl"] ?? "http://localhost:4712";

        // Mixer instruments live outside the mixer workspace (../instruments), which the Angular
        // application builder cannot include as assets. Serve them directly in dev.
        // On the Pi, deploy copies them to wwwroot/mixer/assets/instruments.
        var instrumentsPath = Path.GetFullPath(Path.Combine(env.ContentRootPath, Configuration["DevProxy:InstrumentsPath"] ?? "../../instruments"));
        if (Directory.Exists(instrumentsPath))
        {
          app.UseStaticFiles(new StaticFileOptions
          {
            FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(instrumentsPath),
            RequestPath = "/mixer/assets/instruments",
          });
        }
        else
        {
          _logger?.LogWarning("Dev mode: instruments folder not found: {Path}", instrumentsPath);
        }

        // Mixer: Proxy to mixer dev server (keep /mixer prefix - dev server uses --serve-path /mixer)
        app.UseWhen(
            context => context.Request.Path.Value != null && context.Request.Path.Value.StartsWith("/mixer"),
            appInner =>
            {
              appInner.Run(async (context) =>
              {
                var error = await forwarder.SendAsync(context, mixerUrl, httpClient);
                if (error != ForwarderError.None && error != ForwarderError.UpgradeResponseCanceled)
                {
                  var errorFeature = context.GetForwarderErrorFeature();
                  _logger?.LogWarning("Mixer proxy error: {Error}, {Message}", error, errorFeature?.Exception?.Message);
                }
              });
            });

        // Player: Proxy everything else to player dev server (catch-all)
        app.UseWhen(
            context => context.Request.Path.Value != null &&
                       !context.Request.Path.Value.StartsWith("/api") &&
                       !context.Request.Path.Value.StartsWith("/ws") &&
                       !context.Request.Path.Value.StartsWith("/mixer"),
            appInner =>
            {
              appInner.Run(async (context) =>
              {
                var error = await forwarder.SendAsync(context, playerUrl, httpClient);
                if (error != ForwarderError.None && error != ForwarderError.UpgradeResponseCanceled)
                {
                  var errorFeature = context.GetForwarderErrorFeature();
                  _logger?.LogWarning("Player proxy error: {Error}, {Message}", error, errorFeature?.Exception?.Message);
                }
              });
            });

        _logger?.LogInformation("Dev mode: / -> {PlayerUrl} (Player), /mixer -> {MixerUrl} (Mixer)", playerUrl, mixerUrl);
      }
      else
      {
        // Production mode: Serve static files

        // Serve Mixer app from /mixer path
        app.UseWhen(
            context => context.Request.Path.Value != null && context.Request.Path.Value.StartsWith("/mixer"),
            appInner =>
            {
              appInner.UseStaticFiles(CachedStaticFiles());
              appInner.Run(async (context) =>
              {
                context.Response.Headers.CacheControl = "no-cache";
                var mixerIndexPath = Path.Combine(env.WebRootPath, "mixer", "index.html");
                if (File.Exists(mixerIndexPath))
                {
                  context.Response.ContentType = "text/html";
                  await context.Response.SendFileAsync(mixerIndexPath);
                }
                else
                {
                  context.Response.StatusCode = 404;
                  await context.Response.WriteAsync("Mixer not found. Deploy mixer to wwwroot/mixer/");
                }
              });
            });

        // Serve Player app from root path
        app.UseWhen(
            context => context.Request.Path.Value != null &&
                       !context.Request.Path.Value.StartsWith("/api") &&
                       !context.Request.Path.Value.StartsWith("/mixer"),
            appInner =>
            {
              appInner.UseStaticFiles(CachedStaticFiles());
              appInner.UseDefaultFiles();
              appInner.Run(async (context) =>
              {
                context.Response.Headers.CacheControl = "no-cache";
                context.Response.ContentType = "text/html";
                await context.Response.SendFileAsync(Path.Combine(env.WebRootPath, "index.html"));
              });
            });
      }

      //### start own services ###

      //configure/start ISettingsService
      var settingsService = app.ApplicationServices.GetRequiredService<ISettingsService>();
      settingsService.CheckSettingConsistency();

      CheckUsers(app);

      //configure/start ISSHService
      var sshService = app.ApplicationServices.GetRequiredService<ISshService>();
      sshService.Init();

      // configure/start ISoundService
      var soundService = app.ApplicationServices.GetRequiredService<ISoundService>();
      soundService.Init();
      app.ApplicationServices.GetRequiredService<Microsoft.Extensions.Hosting.IHostApplicationLifetime>()
        .ApplicationStopping.Register(soundService.Shutdown);

      // configure/start ICreditService
      var creditService = app.ApplicationServices.GetRequiredService<ICreditService>();
      creditService.Init();

      // configure/start IAchievementService
      var achievementService = app.ApplicationServices.GetRequiredService<IAchievementService>();
      achievementService.Init();
    }

    // Angular bundles carry a content hash in their name (main-AEFIV4SO.js) -> cache forever.
    private static readonly Regex HashedAsset = new Regex(@"-[A-Z0-9]{8}\.(js|css|mjs)$", RegexOptions.Compiled);

    private static readonly string[] NeverCache = { "index.html", "ngsw.json", "ngsw-worker.js", "safety-worker.js", "worker-basic.min.js", "manifest.webmanifest" };

    private static StaticFileOptions CachedStaticFiles()
    {
      var contentTypes = new FileExtensionContentTypeProvider();
      contentTypes.Mappings[".webmanifest"] = "application/manifest+json";
      return new StaticFileOptions
      {
        ContentTypeProvider = contentTypes,
        OnPrepareResponse = ctx =>
        {
          var name = ctx.File.Name;
          string cacheControl;
          if (NeverCache.Contains(name, StringComparer.OrdinalIgnoreCase))
            cacheControl = "no-cache";
          else if (HashedAsset.IsMatch(name))
            cacheControl = "public, max-age=31536000, immutable";
          else
            cacheControl = "public, max-age=86400";
          ctx.Context.Response.Headers.CacheControl = cacheControl;
        }
      };
    }

    private static void UpdateDatabase(IApplicationBuilder app)
    {
      using var serviceScope = app.ApplicationServices.GetRequiredService<IServiceScopeFactory>().CreateScope();
      var context = serviceScope.ServiceProvider.GetRequiredService<NervboxDBContext>();
      context.Database.Migrate();
      // WAL: readers no longer block the writer (credits, chat, usages). Persistent in the DB file.
      context.Database.ExecuteSqlRaw("PRAGMA journal_mode=WAL;");
    }

    private static void CheckUsers(IApplicationBuilder app)
    {
      using var serviceScope = app.ApplicationServices.GetRequiredService<IServiceScopeFactory>().CreateScope();
      serviceScope.ServiceProvider.GetRequiredService<IUserService>().CheckUsers();
    }

  }
}
