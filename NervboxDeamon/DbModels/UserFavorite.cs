using System;
using System.ComponentModel.DataAnnotations.Schema;

namespace NervboxDeamon.DbModels
{
    [Table("user_favorites")]
    public class UserFavorite
    {
        [Column("user_id")]
        public int UserId { get; set; }

        [Column("sound_hash")]
        public string SoundHash { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [ForeignKey("UserId")]
        public virtual User User { get; set; }

        [ForeignKey("SoundHash")]
        public virtual Sound Sound { get; set; }
    }
}
