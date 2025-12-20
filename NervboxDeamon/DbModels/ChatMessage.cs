using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace NervboxDeamon.DbModels
{
    public enum ChatMessageType
    {
        Text = 0,
        Gif = 1,
        ShekelTransaction = 2
    }

    [Table("chat_messages")]
    public class ChatMessage
    {
        [Key]
        [Column("id")]
        public int Id { get; set; }

        [Required]
        [Column("user_id")]
        public int UserId { get; set; }

        [Required]
        [Column("message")]
        public string Message { get; set; }

        [Column("message_type")]
        public ChatMessageType MessageType { get; set; } = ChatMessageType.Text;

        [Column("gif_url")]
        public string GifUrl { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [ForeignKey("UserId")]
        public virtual User User { get; set; }
    }
}
