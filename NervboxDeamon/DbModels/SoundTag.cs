using System.ComponentModel.DataAnnotations.Schema;

namespace NervboxDeamon.DbModels
{
    [Table("sound_tags")]
    public class SoundTag
    {
        [Column("sound_hash")]
        public string SoundHash { get; set; }

        [Column("tag_id")]
        public int TagId { get; set; }

        [ForeignKey("SoundHash")]
        public virtual Sound Sound { get; set; }

        [ForeignKey("TagId")]
        public virtual Tag Tag { get; set; }
    }
}
