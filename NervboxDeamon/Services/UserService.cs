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
using NervboxDeamon.DbModels;
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
        user = db.Users.SingleOrDefault(x => x.Username == username && x.PasswordHash == GetPasswordHash(password));

        // return null if user not found
        if (user == null)
          return null;

        // Check if user is active
        if (!user.IsActive)
          return null;

        // Update last login time
        user.LastLoginAt = DateTime.UtcNow;
        db.SaveChanges();
      }

      // authentication successful so generate jwt token (14 days validity)
      var tokenHandler = new JwtSecurityTokenHandler();
      var key = Encoding.ASCII.GetBytes(_appSettings.Secret);
      var tokenDescriptor = new SecurityTokenDescriptor
      {
        Subject = new ClaimsIdentity(new Claim[] {
                    new Claim(ClaimTypes.Name, user.Id.ToString()),
                    new Claim("userName", user.Username),
                    new Claim("role", user.Role) }),
        Expires = DateTime.UtcNow.AddDays(14),
        SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
      };
      var token = tokenHandler.CreateToken(tokenDescriptor);
      user.Token = tokenHandler.WriteToken(token);

      return user;
    }

    public User Register(UserRegisterModel model, string ip, out string message)
    {
      using (var scope = ServiceProvider.CreateScope())
      {
        var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();

        // Check if username exists
        if (db.Users.Any(x => x.Username == model.Username))
        {
          message = "User with this name already exists.";
          return null;
        }

        // Check if IP already has an account (1 account per IP)
        if (db.Users.Any(x => x.IpAddress == ip))
        {
          message = "Your IP has no more free account registrations.";
          return null;
        }

        // Get credit settings for initial credits
        var creditSettings = db.CreditSettings.FirstOrDefault();
        var initialCredits = creditSettings?.InitialCreditsUser ?? 50;

        User user = new User()
        {
          Username = model.Username,
          FirstName = model.Firstname,
          LastName = model.Lastname,
          PasswordHash = GetPasswordHash(model.Password),
          Role = "user",
          IpAddress = ip,
          Credits = initialCredits
        };
        db.Users.Add(user);
        db.SaveChanges();

        // Record initial credits transaction
        db.CreditTransactions.Add(new CreditTransaction
        {
          UserId = user.Id,
          Amount = initialCredits,
          TransactionType = CreditTransactionType.Initial,
          Description = "Initial credits upon registration",
          BalanceAfter = initialCredits
        });
        db.SaveChanges();

        message = string.Empty;

        // Generate jwt token (14 days validity)
        var tokenHandler = new JwtSecurityTokenHandler();
        var key = Encoding.ASCII.GetBytes(_appSettings.Secret);
        var tokenDescriptor = new SecurityTokenDescriptor
        {
          Subject = new ClaimsIdentity(new Claim[] {
                    new Claim(ClaimTypes.Name, user.Id.ToString()),
                    new Claim("userName", user.Username),
                    new Claim("role", user.Role) }),
          Expires = DateTime.UtcNow.AddDays(14),
          SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
        };
        var token = tokenHandler.CreateToken(tokenDescriptor);
        user.Token = tokenHandler.WriteToken(token);

        return user;
      }
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
      // Ensure default admin user exists
      using (var scope = this.ServiceProvider.CreateScope())
      {
        var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();
        var users = db.Users.ToList();

        bool changesMade = false;
        foreach (var userShould in UserDefaults)
        {
          if (!users.Exists(u => u.Username.Equals(userShould.Username)))
          {
            db.Users.Add(new User()
            {
              Username = userShould.Username,
              FirstName = userShould.FirstName,
              LastName = userShould.LastName,
              PasswordHash = GetPasswordHash(userShould.PasswordHash),
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

        if (!user.PasswordHash.Equals(GetPasswordHash(model.OldPassword)))
        {
          error = "Wrong password";
          return false;
        }

        user.PasswordHash = GetPasswordHash(model.NewPassword1);
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
          new User() { Username = "admin", FirstName = "Admin", LastName = "User", PasswordHash = "admin", Role = "admin" }
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

    #region Admin Methods

    public IEnumerable<UserAdminDto> GetAllUsersAdmin()
    {
      using (var scope = this.ServiceProvider.CreateScope())
      {
        var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();
        return db.Users.Select(u => new UserAdminDto
        {
          Id = u.Id,
          Username = u.Username,
          FirstName = u.FirstName,
          LastName = u.LastName,
          IpAddress = u.IpAddress,
          Role = u.Role,
          IsActive = u.IsActive,
          CreatedAt = u.CreatedAt,
          LastLoginAt = u.LastLoginAt
        }).ToList();
      }
    }

    public User GetUserById(int id)
    {
      using (var scope = this.ServiceProvider.CreateScope())
      {
        var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();
        return db.Users.FirstOrDefault(u => u.Id == id);
      }
    }

    public User CreateUserByAdmin(AdminCreateUserModel model, out string error)
    {
      error = string.Empty;

      using (var scope = ServiceProvider.CreateScope())
      {
        var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();

        // Check if username exists
        if (db.Users.Any(x => x.Username == model.Username))
        {
          error = "User with this name already exists.";
          return null;
        }

        var user = new User()
        {
          Username = model.Username,
          FirstName = model.FirstName,
          LastName = model.LastName,
          PasswordHash = GetPasswordHash(model.Password),
          Role = model.Role ?? "user",
          IsActive = true
        };
        db.Users.Add(user);
        db.SaveChanges();

        return user;
      }
    }

    public User UpdateUser(int id, AdminUpdateUserModel model, out string error)
    {
      error = string.Empty;

      using (var scope = ServiceProvider.CreateScope())
      {
        var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();
        var user = db.Users.FirstOrDefault(u => u.Id == id);

        if (user == null)
        {
          error = "User not found.";
          return null;
        }

        if (model.FirstName != null)
          user.FirstName = model.FirstName;

        if (model.LastName != null)
          user.LastName = model.LastName;

        if (model.Role != null)
          user.Role = model.Role;

        if (model.IsActive.HasValue)
          user.IsActive = model.IsActive.Value;

        db.SaveChanges();
        return user;
      }
    }

    public bool ResetPassword(int id, string newPassword, out string error)
    {
      error = string.Empty;

      using (var scope = ServiceProvider.CreateScope())
      {
        var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();
        var user = db.Users.FirstOrDefault(u => u.Id == id);

        if (user == null)
        {
          error = "User not found.";
          return false;
        }

        user.PasswordHash = GetPasswordHash(newPassword);
        db.SaveChanges();
        return true;
      }
    }

    public bool ToggleUserActive(int id, out string error)
    {
      error = string.Empty;

      using (var scope = ServiceProvider.CreateScope())
      {
        var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();
        var user = db.Users.FirstOrDefault(u => u.Id == id);

        if (user == null)
        {
          error = "User not found.";
          return false;
        }

        user.IsActive = !user.IsActive;
        db.SaveChanges();
        return true;
      }
    }

    public bool DeleteUser(int id, out string error)
    {
      error = string.Empty;

      using (var scope = ServiceProvider.CreateScope())
      {
        var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();
        var user = db.Users.FirstOrDefault(u => u.Id == id);

        if (user == null)
        {
          error = "User not found.";
          return false;
        }

        // Prevent deleting admin user
        if (user.Username == "admin")
        {
          error = "Cannot delete admin user.";
          return false;
        }

        db.Users.Remove(user);
        db.SaveChanges();
        return true;
      }
    }

    #endregion

  }
}
