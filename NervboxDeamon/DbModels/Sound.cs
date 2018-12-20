﻿using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Linq;
using System.Threading.Tasks;

namespace NervboxDeamon.DbModels
{
  public class Sound
  {
    [Key]
    [Required]
    [Column("hash")]
    public string Hash { get; set; }

    [Column("fileName")]
    public string FileName { get; set; }

    [Column("allowed")]
    public bool Allowed { get; set; }

    [Column("valid")]
    public bool Valid { get; set; }
  }
}