using System;
using System.Collections.Generic;
using System.Linq;
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

    public UsersController(IUserService userService)
    {
      _userService = userService;
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

  }
}