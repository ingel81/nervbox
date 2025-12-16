using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NervboxDeamon.Migrations
{
    /// <inheritdoc />
    public partial class AddChatMessageGifSupport : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "gif_url",
                table: "chat_messages",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "message_type",
                table: "chat_messages",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "gif_url",
                table: "chat_messages");

            migrationBuilder.DropColumn(
                name: "message_type",
                table: "chat_messages");
        }
    }
}
