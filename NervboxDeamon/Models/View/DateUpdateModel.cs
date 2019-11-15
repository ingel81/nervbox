using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Threading.Tasks;

namespace NervboxDeamon.Models.View
{
  public class DateUpdateModel
  {
    [Required]
    public DateTime NewDate { get; set; }

  }
}
