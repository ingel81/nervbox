using System;
using System.ComponentModel.DataAnnotations;

namespace NervboxDeamon.Models.View
{
    /// <summary>
    /// User DTO for admin list view (includes IP address)
    /// </summary>
    public class UserAdminDto
    {
        public int Id { get; set; }
        public string Username { get; set; }
        public string FirstName { get; set; }
        public string LastName { get; set; }
        public string IpAddress { get; set; }
        public string Role { get; set; }
        public bool IsActive { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? LastLoginAt { get; set; }
        public int Credits { get; set; }
    }

    /// <summary>
    /// Model for admin to create a new user (no IP restriction)
    /// </summary>
    public class AdminCreateUserModel
    {
        [Required]
        public string Username { get; set; }

        [Required]
        [MinLength(4)]
        public string Password { get; set; }

        public string FirstName { get; set; }
        public string LastName { get; set; }
        public string Role { get; set; } = "user";
    }

    /// <summary>
    /// Model for admin to reset a user's password
    /// </summary>
    public class AdminResetPasswordModel
    {
        [Required]
        [MinLength(4)]
        public string NewPassword { get; set; }
    }

    /// <summary>
    /// Model for admin to update user details
    /// </summary>
    public class AdminUpdateUserModel
    {
        public string FirstName { get; set; }
        public string LastName { get; set; }
        public string Role { get; set; }
        public bool? IsActive { get; set; }
    }
}
