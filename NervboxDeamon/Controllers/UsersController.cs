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

    }
}