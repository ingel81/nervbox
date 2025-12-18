using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace NervboxDeamon.DbModels
{
    [Table("users")]
    public class User
    {
        [Key]
        [Column("id")]
        public int Id { get; set; }

        [Required]
        [Column("username")]
        public string Username { get; set; }

        [JsonIgnore]
        [Required]
        [Column("password_hash")]
        public string PasswordHash { get; set; }

        [Column("first_name")]
        public string FirstName { get; set; }

        [Column("last_name")]
        public string LastName { get; set; }

        [JsonIgnore]
        [Column("ip_address")]
        public string IpAddress { get; set; }

        [Column("role")]
        public string Role { get; set; } = "user";

        [Column("created_at")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [NotMapped]
        public string Token { get; set; }

        [JsonIgnore]
        public virtual ICollection<UserFavorite> Favorites { get; set; } = new List<UserFavorite>();
    }
}
