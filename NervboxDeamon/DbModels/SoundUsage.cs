using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace NervboxDeamon.DbModels
{
    [Table("sound_usages")]
    public class SoundUsage
    {
        [Key]
        [Column("id")]
        public int Id { get; set; }

        [Required]
        [Column("sound_hash")]
        public string SoundHash { get; set; }

        [Column("user_id")]
        public int? UserId { get; set; }

        [Column("played_at")]
        public DateTime PlayedAt { get; set; } = DateTime.UtcNow;

        [ForeignKey("SoundHash")]
        public virtual Sound Sound { get; set; }

        [ForeignKey("UserId")]
        public virtual User User { get; set; }
    }
}

