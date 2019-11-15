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

        [Column("playedByUserId")]
        public int PlayedByUserId { get; set; }

        [ForeignKey("PlayedByUserId")]
        public virtual User User { get; set; }


    }
}

