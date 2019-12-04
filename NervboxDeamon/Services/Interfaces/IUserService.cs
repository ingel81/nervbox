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
    }
}
