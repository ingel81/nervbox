using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NervboxDeamon.Migrations
{
    /// <inheritdoc />
    public partial class AddSoundAuthor : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "author_id",
                table: "sounds",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_sounds_author_id",
                table: "sounds",
                column: "author_id");

            migrationBuilder.AddForeignKey(
                name: "FK_sounds_users_author_id",
                table: "sounds",
                column: "author_id",
                principalTable: "users",
                principalColumn: "id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_sounds_users_author_id",
                table: "sounds");

            migrationBuilder.DropIndex(
                name: "IX_sounds_author_id",
                table: "sounds");

            migrationBuilder.DropColumn(
                name: "author_id",
                table: "sounds");
        }
    }
}
