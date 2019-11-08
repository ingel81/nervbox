using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using NervboxDeamon.DbModels;

namespace NervboxDeamon
{
  public class NervboxDBContext : DbContext
  {
    // When used with ASP.net core, add these lines to Startup.cs
    //   var connectionString = Configuration.GetConnectionString("BlogContext");
    //   services.AddEntityFrameworkNpgsql().AddDbContext<BlogContext>(options => options.UseNpgsql(connectionString));
    // and add this to appSettings.json
    // "ConnectionStrings": { "BlogContext": "Server=localhost;Database=blog" }

    /*
      Howto: 

      add-migration {name}
      update-database

      --> 

    */

    public NervboxDBContext(DbContextOptions<NervboxDBContext> options) : base(options) { }

    public DbSet<Setting> Settings { get; set; }
    public DbSet<User> Users { get; set; }
  }
}
