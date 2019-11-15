using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Linq;
using System.Text.Json.Serialization;
using System.Threading.Tasks;

namespace NervboxDeamon.DbModels
{

  [Table("users")]
  public class User
  {
    [Key]
    [Required]
    public int Id { get; set; }

    public string Email { get; set; }
    public string FirstName { get; set; }
    public string LastName { get; set; }

    [Required]
    public string Username { get; set; }

    [JsonIgnore]
    public string Password { get; set; }
    public string Token { get; set; }

    [Required]
    public string Role { get; set; }
  }
}
