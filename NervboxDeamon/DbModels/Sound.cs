using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace NervboxDeamon.DbModels
{
    [Table("sounds")]
    public class Sound
    {
        [Key]
        [Required]
        [Column("hash")]
        public string Hash { get; set; }

        [Required]
        [Column("name")]
        public string Name { get; set; }

        [Required]
        [Column("file_name")]
        public string FileName { get; set; }

        [Column("duration_ms")]
        public int DurationMs { get; set; }

        [Column("size_bytes")]
        public long SizeBytes { get; set; }

        [Column("enabled")]
        public bool Enabled { get; set; } = true;

        [Column("created_at")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [Column("author_id")]
        public int? AuthorId { get; set; }

        [ForeignKey("AuthorId")]
        public virtual User Author { get; set; }

        public virtual ICollection<SoundTag> SoundTags { get; set; } = new List<SoundTag>();
        public virtual ICollection<SoundUsage> Usages { get; set; } = new List<SoundUsage>();
        public virtual ICollection<UserFavorite> Favorites { get; set; } = new List<UserFavorite>();
    }
}
