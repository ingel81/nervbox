using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using NervboxDeamon.DbModels;
using NervboxDeamon.Helpers;
using NervboxDeamon.Models.Settings;
using NervboxDeamon.Models.View;
using NervboxDeamon.Services.Interfaces;

namespace NervboxDeamon.Services
{

  /// <summary>
  /// Managed Benutzerverwaltung und Anmeldung
  /// </summary>
  public class UserService : IUserService
  {
    private readonly AppSettings _appSettings;
    private readonly IServiceProvider ServiceProvider;


    public UserService(IOptions<AppSettings> appSettings, IServiceProvider serviceProvider)
    {
      _appSettings = appSettings.Value;
      this.ServiceProvider = serviceProvider;
    }

    public User Authenticate(string username, string password)
    {
      User user = null;

      using (var scope = ServiceProvider.CreateScope())
      {
        var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();
        user = db.Users.SingleOrDefault(x => x.Username == username && x.Password == GetPasswordHash(password));
      }

      // return null if user not found
      if (user == null)
        return null;

      // authentication successful so generate jwt token
      var tokenHandler = new JwtSecurityTokenHandler();
      var key = Encoding.ASCII.GetBytes(_appSettings.Secret);
      var tokenDescriptor = new SecurityTokenDescriptor
      {
        Subject = new ClaimsIdentity(new Claim[] {
          new Claim(ClaimTypes.Name, user.Id.ToString()),
          new Claim("userName", user.Username),
          new Claim("role", user.Role) }),
        Expires = DateTime.UtcNow.AddDays(7),
        SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
      };
      var token = tokenHandler.CreateToken(tokenDescriptor);
      user.Token = tokenHandler.WriteToken(token);

      // remove password before returning
      user.Password = null;

      return user;
    }

    public IEnumerable<User> GetAll()
    {
      using (var scope = this.ServiceProvider.CreateScope())
      {
        var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();
        return db.Users.ToList();
      }
    }

    public void CheckUsers()
    {
      //check if user exists

      using (var scope = this.ServiceProvider.CreateScope())
      {
        var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();
        var users = db.Users.ToList();

        bool changesMade = false;
        foreach (var userShould in UserDefaults)
        {
          if (users.Exists(u => u.Username.Equals(userShould.Username)) == false)
          {
            db.Users.Add(new User()
            {
              Email = userShould.Email,
              Username = userShould.Username,
              FirstName = userShould.FirstName,
              LastName = userShould.LastName,
              Token = userShould.Token,
              Password = GetPasswordHash(userShould.Password),
              Role = userShould.Role
            });

            changesMade = true;
          }
        }

        if (changesMade)
        {
          db.SaveChanges();
        }
      }
    }

    public bool ChangePassword(int userId, UserChangePasswordModel model, out string error)
    {
      error = string.Empty;

      if (!model.NewPassword1.Equals(model.NewPassword2))
      {
        error = "Password mismatch";
        return false;
      }

      using (var scope = this.ServiceProvider.CreateScope())
      {
        var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();
        var user = db.Users.Where(u => u.Id == userId).FirstOrDefault();

        if (user == null)
        {
          error = "User not found";
          return false;
        }

        if (!user.Password.Equals(GetPasswordHash(model.OldPassword)))
        {
          error = "Wrong password";
          return false;
        }

        user.Password = GetPasswordHash(model.NewPassword1);
        db.SaveChanges();
        return true;
      }
    }

    private List<User> UserDefaults
    {
      get
      {
        return new List<User>()
        {
          new User(){Username = "k1", Id = -1, LastName = "Kunde", FirstName = "k1", Token = null, Email = null, Password ="k1ikh88", Role = "customer_low" },
          new User(){Username = "k2", Id = -1, LastName = "Kunde", FirstName = "k2", Token = null, Email = null, Password ="k2k6aor", Role = "customer_medium"},
          new User(){Username = "k3", Id = -1, LastName = "Kunde", FirstName = "k3", Token = null, Email = null, Password ="k35swaa", Role = "customer_high"},
          new User(){Username = "t1", Id = -1, LastName = "Nervbox", FirstName = "t1", Token = null, Email = null, Password ="t1qowk2gds", Role = "nervbox_low" },
          new User(){Username = "t2", Id = -1, LastName = "Nervbox", FirstName = "t2", Token = null, Email = null, Password ="t2vn04qb12", Role = "nervbox_medium"  },
          new User(){Username = "t3", Id = -1, LastName = "Nervbox", FirstName = "t3", Token = null, Email = null, Password ="t34fgsj3ad", Role = "nervbox_high"  },
        };
      }
    }

    private static string GetPasswordHash(string text)
    {
      // SHA512 is disposable by inheritance.  
      using (var sha256 = SHA256.Create())
      {
        // Send a sample text to hash.  
        var hashedBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(text));
        // Get the hashed string.  
        return BitConverter.ToString(hashedBytes).Replace("-", "").ToLower();
      }
    }

  }
}
