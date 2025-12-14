using Microsoft.EntityFrameworkCore;
using NervboxDeamon.DbModels;

namespace NervboxDeamon
{
    public class NervboxDBContext : DbContext
    {
        public NervboxDBContext(DbContextOptions<NervboxDBContext> options) : base(options) { }

        public DbSet<Setting> Settings { get; set; }
        public DbSet<User> Users { get; set; }
        public DbSet<Sound> Sounds { get; set; }
        public DbSet<Tag> Tags { get; set; }
        public DbSet<SoundTag> SoundTags { get; set; }
        public DbSet<SoundUsage> SoundUsages { get; set; }
        public DbSet<ChatMessage> ChatMessages { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // SoundTag: Composite Primary Key
            modelBuilder.Entity<SoundTag>()
                .HasKey(st => new { st.SoundHash, st.TagId });

            // SoundTag: Relationships
            modelBuilder.Entity<SoundTag>()
                .HasOne(st => st.Sound)
                .WithMany(s => s.SoundTags)
                .HasForeignKey(st => st.SoundHash);

            modelBuilder.Entity<SoundTag>()
                .HasOne(st => st.Tag)
                .WithMany(t => t.SoundTags)
                .HasForeignKey(st => st.TagId);

            // User: Unique IP address constraint
            modelBuilder.Entity<User>()
                .HasIndex(u => u.IpAddress)
                .IsUnique();

            // User: Unique username constraint
            modelBuilder.Entity<User>()
                .HasIndex(u => u.Username)
                .IsUnique();

            // Tag: Unique name constraint
            modelBuilder.Entity<Tag>()
                .HasIndex(t => t.Name)
                .IsUnique();
        }
    }
}
