using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Threading.Tasks;

namespace NervboxDeamon.Models.View
{
  public class UserChangePasswordModel
  {
    [Required]
    public string OldPassword { get; set; }

    [Required]
    public string NewPassword1 { get; set; }

    [Required]
    public string NewPassword2 { get; set; }
  }
}
