using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Linq;
using System.Threading.Tasks;

namespace NervboxDeamon.DbModels
{
  [Table("chatmessage")]
  public class ChatMessage
  {
    [Key]
    [Required]
    public long Id { get; set; }

    [Required]
    [Column("date")]
    public DateTime Date { get; set; }

    [Required]
    [Column("type")]
    public string Type { get; set; }

    [Required]
    [Column("message")]
    public string Message { get; set; }

    [Column("userId")]
    public int UserId { get; set; }

    [ForeignKey("UserId")]
    public virtual User User { get; set; }
    
    [Required]
    [Column("username")]
    public string Username { get; set; }

  }
}
