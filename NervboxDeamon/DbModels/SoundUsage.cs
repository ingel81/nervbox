using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Linq;
using System.Threading.Tasks;

namespace NervboxDeamon.DbModels
{
  [Table("soundusage")]
  public class SoundUsage
  {
    [Key]
    [Required]
    [Column("time")]
    public DateTime Time { get; set; }

    [Column("soundhash")]
    public string SoundHash { get; set; }

    [ForeignKey("SoundHash")]
    public virtual Sound Sound { get; set; }

    [Column("initiator")]
    public string Initiator { get; set; }
  }
}

/*
-using System.Collections.Generic;
-using System.ComponentModel.DataAnnotations;
-using System.ComponentModel.DataAnnotations.Schema;
-using System.Linq;
-using System.Threading.Tasks;
-
-namespace NervboxDeamon.DbModels
-{
-  [Table("records")]
-  public class Record
-  {
-    [Key]
-    [Required]
-    [Column("time")]
-    public DateTime Time { get; set; }
-
-    [Column("cur")]
-    public double Current { get; set; }
-
-    [Column("acc")]
-    public double Acceleration { get; set; }
-
-    [Column("temp_1")]
-    public double Temperature1 { get; set; }
-
-    [Column("temp_2")]
-    public double Temperature2 { get; set; }
-
-    [Column("temp_3")]
-    public double Temperature3 { get; set; }
-
-    [Column("temp_b")]
-    public double TemperatureB { get; set; }
-
-    [Column("cycl")]
-    public long Cycles { get; set; }
-
-  }
-}
*/
