using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NervboxDeamon.Controllers.Base;
using NervboxDeamon.DbModels;
using NervboxDeamon.Models.View;
using NervboxDeamon.Services;
using NervboxDeamon.Services.Interfaces;

namespace NervboxDeamon.Controllers
{
    /// <summary>
    /// Controller für die Benutzerverwaltung / Anmeldung
    /// </summary>
    [Route("api/[controller]")]
    [ApiController]
    public class UsersController : NervboxBaseController<UsersController>
    {
        private IUserService _userService;
        private IHttpContextAccessor Accessor { get; }

        public UsersController(IUserService userService, IHttpContextAccessor accessor)
        {
            _userService = userService;
            Accessor = accessor;
        }

        [AllowAnonymous]
        [HttpPost("auth/login")]
        public IActionResult Authenticate([FromBody]UserLoginModel userParam)
        {
            var user = _userService.Authenticate(userParam.Username, userParam.Password);

            if (user == null)
                return BadRequest(new { message = "Username or password is incorrect" });

            return Ok(user);
        }

        [AllowAnonymous]
        [HttpPost("auth/register")]
        public IActionResult Authenticate([FromBody]UserRegisterModel model)
        {
            var ip = Accessor.HttpContext.Connection.RemoteIpAddress.ToString();

            var user = _userService.Register(model, ip, out string message);

            if (user == null)
            {
                return BadRequest(message);
            }

            return Ok(user);
        }

        [Authorize]
        [HttpPost("changepassword")]
        public IActionResult ChangePassword(UserChangePasswordModel model)
        {
            var id = int.Parse(this.User.Identity.Name);
            var result = _userService.ChangePassword(id, model, out string error);
            return Ok(new { Success = result, Error = error });
        }

        [HttpDelete("auth/logout")]
        public IActionResult Logout()
        {
            return Ok();
        }

        [HttpGet]
        public IActionResult GetAll()
        {
            var users = _userService.GetAll();
            return Ok(users);
        }

        [Authorize(Roles = "nervbox_medium,nervbox_high")]
        [HttpDelete]
        public async Task<IActionResult> DeleteAllUsers()
        {
            int result = await this.DbContext.Database.ExecuteSqlRawAsync($"TRUNCATE users;");
            return Ok(new { RowsAffected = result });
        }

        #region Admin Endpoints

        /// <summary>
        /// Get all users with full details including IP (Admin only)
        /// </summary>
        [Authorize(Roles = "admin")]
        [HttpGet("admin")]
        public IActionResult GetAllUsersAdmin()
        {
            var users = _userService.GetAllUsersAdmin();
            return Ok(users);
        }

        /// <summary>
        /// Create a new user (Admin only, no IP restriction)
        /// </summary>
        [Authorize(Roles = "admin")]
        [HttpPost("admin")]
        public IActionResult CreateUser([FromBody] AdminCreateUserModel model)
        {
            var user = _userService.CreateUserByAdmin(model, out string error);

            if (user == null)
                return BadRequest(new { message = error });

            return Ok(user);
        }

        /// <summary>
        /// Update user details (Admin only)
        /// </summary>
        [Authorize(Roles = "admin")]
        [HttpPut("admin/{id}")]
        public IActionResult UpdateUser(int id, [FromBody] AdminUpdateUserModel model)
        {
            var user = _userService.UpdateUser(id, model, out string error);

            if (user == null)
                return BadRequest(new { message = error });

            return Ok(user);
        }

        /// <summary>
        /// Reset user password (Admin only)
        /// </summary>
        [Authorize(Roles = "admin")]
        [HttpPost("admin/{id}/reset-password")]
        public IActionResult ResetPassword(int id, [FromBody] AdminResetPasswordModel model)
        {
            var result = _userService.ResetPassword(id, model.NewPassword, out string error);

            if (!result)
                return BadRequest(new { message = error });

            return Ok(new { success = true });
        }

        /// <summary>
        /// Toggle user active status (Admin only)
        /// </summary>
        [Authorize(Roles = "admin")]
        [HttpPut("admin/{id}/toggle-active")]
        public IActionResult ToggleUserActive(int id)
        {
            var result = _userService.ToggleUserActive(id, out string error);

            if (!result)
                return BadRequest(new { message = error });

            return Ok(new { success = true });
        }

        /// <summary>
        /// Delete a user (Admin only)
        /// </summary>
        [Authorize(Roles = "admin")]
        [HttpDelete("admin/{id}")]
        public IActionResult DeleteUser(int id)
        {
            var result = _userService.DeleteUser(id, out string error);

            if (!result)
                return BadRequest(new { message = error });

            return Ok(new { success = true });
        }

        #endregion

        #region Avatar Endpoints

        /// <summary>
        /// Upload or update user avatar (authenticated user)
        /// </summary>
        [Authorize]
        [HttpPost("avatar")]
        public async Task<IActionResult> UploadAvatar(IFormFile file)
        {
            if (file == null || file.Length == 0)
                return BadRequest(new { message = "No file uploaded" });

            // Validate file type
            var allowedTypes = new[] { "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp" };
            if (!allowedTypes.Contains(file.ContentType.ToLower()))
                return BadRequest(new { message = "Invalid file type. Allowed: JPEG, PNG, GIF, WebP" });

            // Validate file size (max 5MB)
            if (file.Length > 5 * 1024 * 1024)
                return BadRequest(new { message = "File too large. Maximum size: 5MB" });

            var userId = int.Parse(this.User.Identity.Name);

            using var memoryStream = new MemoryStream();
            await file.CopyToAsync(memoryStream);
            var imageData = memoryStream.ToArray();

            var result = _userService.SaveAvatar(userId, imageData, file.ContentType, out string error);

            if (!result)
                return BadRequest(new { message = error });

            return Ok(new {
                success = true,
                avatarUrl = _userService.GetAvatarUrl(userId)
            });
        }

        /// <summary>
        /// Get user avatar by ID (public)
        /// </summary>
        [AllowAnonymous]
        [HttpGet("{id}/avatar")]
        public IActionResult GetAvatar(int id)
        {
            var avatar = _userService.GetAvatar(id);

            if (avatar == null)
                return NotFound();

            // Set cache headers for 1 hour
            Response.Headers.Append("Cache-Control", "public, max-age=3600");

            return File(avatar.Value.data, avatar.Value.contentType);
        }

        /// <summary>
        /// Delete user avatar (authenticated user)
        /// </summary>
        [Authorize]
        [HttpDelete("avatar")]
        public IActionResult DeleteAvatar()
        {
            var userId = int.Parse(this.User.Identity.Name);

            var result = _userService.DeleteAvatar(userId, out string error);

            if (!result)
                return BadRequest(new { message = error });

            return Ok(new { success = true });
        }

        /// <summary>
        /// Get current user's avatar URL
        /// </summary>
        [Authorize]
        [HttpGet("avatar")]
        public IActionResult GetMyAvatarUrl()
        {
            var userId = int.Parse(this.User.Identity.Name);
            var avatarUrl = _userService.GetAvatarUrl(userId);

            return Ok(new { avatarUrl });
        }

        #endregion

        #region Profile Endpoints

        /// <summary>
        /// Get public user profile by ID
        /// </summary>
        [AllowAnonymous]
        [HttpGet("{id}/profile")]
        public IActionResult GetUserProfile(int id)
        {
            var user = this.DbContext.Users.FirstOrDefault(u => u.Id == id);

            if (user == null)
                return NotFound(new { message = "User not found" });

            // Don't show system user profiles
            if (user.Role == "system")
                return NotFound(new { message = "User not found" });

            // Get sounds authored by this user
            var sounds = this.DbContext.Sounds
                .Where(s => s.AuthorId == id && s.Enabled)
                .Select(s => new
                {
                    s.Hash,
                    s.Name,
                    s.FileName,
                    s.DurationMs,
                    s.CreatedAt,
                    PlayCount = s.Usages.Count()
                })
                .OrderByDescending(s => s.CreatedAt)
                .ToList();

            // Get total play count for user's sounds
            var totalPlays = this.DbContext.SoundUsages
                .Count(u => u.UserId == id);

            return Ok(new
            {
                Id = user.Id,
                Username = user.Username,
                FirstName = user.FirstName,
                LastName = user.LastName,
                CreatedAt = user.CreatedAt,
                Sounds = sounds,
                Stats = new
                {
                    SoundCount = sounds.Count,
                    TotalPlays = totalPlays
                }
            });
        }

        #endregion

    }
}