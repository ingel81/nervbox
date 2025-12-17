using System;
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
      var appSettings = appSettingsSection.Get<AppSettings>();
      var dbPath = appSettings?.DatabasePath ?? "nervbox.db";

      services.AddDbContext<NervboxDBContext>(options =>
          options.UseSqlite($"Data Source={dbPath}"));

      services.AddCors(options => options.AddPolicy("CorsPolicy", builder =>
      {
        builder
            .AllowAnyMethod()
            .AllowAnyHeader()
            .AllowAnyOrigin()
            .WithOrigins("http://localhost:4200", "http://127.0.0.1:4200")
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
      });

      // configure DI for application services
      services.AddSingleton<IHttpContextAccessor, HttpContextAccessor>();
      services.AddScoped<IUserService, UserService>();
      services.AddSingleton<ISettingsService, SettingsService>();
      services.AddSingleton<ISshService, SSHService>();
      services.AddSingleton<ISystemService, SystemService>();
      services.AddSingleton<ISoundService, SoundService>();
      services.AddSingleton<IGiphyService, GiphyService>();
      // services.AddSingleton<ICamService, CamService>(); // Deaktiviert - nicht benötigt

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
      else
      {
        // Production: HTTP → HTTPS Redirect
        app.UseHttpsRedirection();
      }

      // global cors policy
      app.UseCors("CorsPolicy");

      app.UseRouting();

      app.UseAuthentication();
      app.UseAuthorization();

      app.UseEndpoints(endpoints =>
      {
        endpoints.MapHub<SoundHub>("/ws/soundHub");
        endpoints.MapHub<SshHub>("/ws/sshHub");
        endpoints.MapHub<CamHub>("/ws/camHub");
        endpoints.MapHub<ChatHub>("/ws/chatHub");
        endpoints.MapControllerRoute("default", "{controller=Home}/{action=Index}/{id?}");
      });

      // ========== FRONTEND ROUTING ==========
      // /       -> Player App (dev: 4200, prod: wwwroot)
      // /mixer  -> Mixer App (dev: 4201, prod: wwwroot/mixer)

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

        // Mixer: Proxy to localhost:4201 (keep /mixer prefix - dev server uses --serve-path /mixer)
        app.UseWhen(
            context => context.Request.Path.Value != null && context.Request.Path.Value.StartsWith("/mixer"),
            appInner =>
            {
              appInner.Run(async (context) =>
              {
                var error = await forwarder.SendAsync(context, "http://localhost:4201", httpClient);
                if (error != ForwarderError.None)
                {
                  var errorFeature = context.GetForwarderErrorFeature();
                  _logger?.LogWarning("Mixer proxy error: {Error}, {Message}", error, errorFeature?.Exception?.Message);
                }
              });
            });

        // Player: Proxy everything else to localhost:4200 (catch-all)
        app.UseWhen(
            context => context.Request.Path.Value != null &&
                       !context.Request.Path.Value.StartsWith("/api") &&
                       !context.Request.Path.Value.StartsWith("/ws") &&
                       !context.Request.Path.Value.StartsWith("/mixer"),
            appInner =>
            {
              appInner.Run(async (context) =>
              {
                var error = await forwarder.SendAsync(context, "http://localhost:4200", httpClient);
                if (error != ForwarderError.None)
                {
                  var errorFeature = context.GetForwarderErrorFeature();
                  _logger?.LogWarning("Player proxy error: {Error}, {Message}", error, errorFeature?.Exception?.Message);
                }
              });
            });

        _logger?.LogInformation("Dev mode: / -> localhost:4200 (Player), /mixer -> localhost:4201 (Mixer)");
      }
      else
      {
        // Production mode: Serve static files

        // Serve Mixer app from /mixer path
        app.UseWhen(
            context => context.Request.Path.Value != null && context.Request.Path.Value.StartsWith("/mixer"),
            appInner =>
            {
              appInner.UseStaticFiles();
              appInner.Run(async (context) =>
              {
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
              appInner.UseStaticFiles();
              appInner.UseDefaultFiles();
              appInner.Run(async (context) =>
              {
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
    }

    private static void UpdateDatabase(IApplicationBuilder app)
    {
      using (var serviceScope = app.ApplicationServices.GetRequiredService<IServiceScopeFactory>().CreateScope())
      {
        using (var context = serviceScope.ServiceProvider.GetService<NervboxDBContext>())
        {
          context.Database.Migrate();
        }
      }
    }

    private static void CheckUsers(IApplicationBuilder app)
    {
      using (var serviceScope = app.ApplicationServices.GetRequiredService<IServiceScopeFactory>().CreateScope())
      {
        serviceScope.ServiceProvider.GetService<IUserService>().CheckUsers();
      }
    }

  }
}
