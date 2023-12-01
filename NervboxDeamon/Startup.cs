using System;
using System.Collections.Generic;
using System.Data.Common;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Protocol;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;
using NervboxDeamon.Helpers;
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
      var connectionString = Configuration.GetConnectionString("NervboxContext");
      services.AddEntityFrameworkNpgsql().AddDbContext<NervboxDBContext>(options => options.UseNpgsql(connectionString, o => { o.SetPostgresVersion(9, 6); }));

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
      var appSettingsSection = Configuration.GetSection("AppSettings");
      services.Configure<AppSettings>(appSettingsSection);

      // configure jwt authentication
      var appSettings = appSettingsSection.Get<AppSettings>();
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

      //auto migration db
      UpdateDatabase(app);

      try
      {
        using (var serviceScope = app.ApplicationServices.GetRequiredService<IServiceScopeFactory>().CreateScope())
        {
          var db = serviceScope.ServiceProvider.GetService<NervboxDBContext>().Database;

          //apply pending migrations
          db.Migrate();

          try
          {
            DbConnection con = db.GetDbConnection();
            con.Open();
            DbCommand cmd = con.CreateCommand();
            cmd.CommandText = @"SELECT COUNT(1) FROM _timescaledb_catalog.hypertable WHERE table_name = 'soundusage' LIMIT 1";
            Int64 hyperTable = (Int64)cmd.ExecuteScalar();
            con.Close();

            if (hyperTable == 0)
            {
              //try setting hypertable mode for our records table
              var result = db.ExecuteSqlRaw("SELECT create_hypertable('soundusage', 'time', chunk_time_interval => interval '1 day');"); //1 day

            }
            else
            {
              //already created --> do nothing
            }
          }
          catch (Npgsql.PostgresException ex) when (ex.SqlState.Equals("TS110")) //ignore this error
          {
            //System.Diagnostics.Debugger.Break();
          }
        }
      }
      catch (Exception ex)
      {
        Logger.LogCritical(ex, "Failed to migrate or seed database");
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
