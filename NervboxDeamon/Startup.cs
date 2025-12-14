using System;
using System.IO;
using System.Text;
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

namespace NervboxDeamon
{
  public class Startup
  {
    private readonly ILogger<Startup> Logger;
    public IConfiguration Configuration { get; }

    public Startup(ILogger<Startup> logger, IConfiguration configuration)
    {
      Logger = logger;
      Configuration = configuration;

      Logger.LogInformation("Starting");

      AppDomain.CurrentDomain.ProcessExit += (s, e) =>
      {
              // shutdown
              Logger.LogInformation("Going down");
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
      services.AddSingleton<ICamService, CamService>();

      services.Configure<IISServerOptions>(options =>
      {
        options.AllowSynchronousIO = true;
      });

    }

    // This method gets called by the runtime. Use this method to configure the HTTP request pipeline.    
    public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
    {
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
        Logger.LogCritical(ex, "Failed to migrate database");
      }

      if (env.EnvironmentName == "Development")
      {
        app.UseDeveloperExceptionPage();
      }

      // global cors policy
      app.UseCors("CorsPolicy");

      //app.UseSignalR(routes =>
      //{
      //  routes.MapHub<SerialComHub>("/serialComHub");
      //  routes.MapHub<SshHub>("/sshHub");
      //  routes.MapHub<InfoModuleHub>("/moduleHub");
      //});

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

      //app.UseMvc();

      //app.UseStaticFiles();
      //app.UseDefaultFiles();
      //app.Run(async (context) =>
      //{
      //  context.Response.ContentType = "text/html";
      //  await context.Response.SendFileAsync(Path.Combine(env.WebRootPath, "index.html"));
      //});

      app.UseWhen(
          context => !context.Request.Path.Value.StartsWith("/api"),
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


      //### start own services ###

      //configure/start ISettingsService
      var settingsService = app.ApplicationServices.GetRequiredService<ISettingsService>();
      settingsService.CheckSettingConsistency();

      //var userService = app.ApplicationServices.GetRequiredService<IUserService>();
      //userService.CheckUsers();
      CheckUsers(app);

      //configure/start ISSHService
      var sshService = app.ApplicationServices.GetRequiredService<ISshService>();
      sshService.Init();

      // configure/start ISoundService
      var soundService = app.ApplicationServices.GetRequiredService<ISoundService>();
      soundService.Init();

      // configure/start ISoundService
      var camService = app.ApplicationServices.GetRequiredService<ICamService>();
      camService.Init();

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
