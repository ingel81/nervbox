using System.Collections.Generic;
using NervboxDeamon.DbModels;
using NervboxDeamon.Models.View;

namespace NervboxDeamon.Services.Interfaces
{
    public interface IUserService
    {
        User Authenticate(string username, string password);
        IEnumerable<User> GetAll();
        void CheckUsers();
        bool ChangePassword(int userId, UserChangePasswordModel model, out string error);
        User Register(UserRegisterModel model, string ip, out string message);

        // Admin methods
        IEnumerable<UserAdminDto> GetAllUsersAdmin();
        User GetUserById(int id);
        User CreateUserByAdmin(AdminCreateUserModel model, out string error);
        User UpdateUser(int id, AdminUpdateUserModel model, out string error);
        bool ResetPassword(int id, string newPassword, out string error);
        bool ToggleUserActive(int id, out string error);
        bool DeleteUser(int id, out string error);
    }
}
