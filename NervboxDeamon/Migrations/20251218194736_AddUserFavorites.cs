using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NervboxDeamon.Migrations
{
    /// <inheritdoc />
    public partial class AddUserFavorites : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "user_favorites",
                columns: table => new
                {
                    user_id = table.Column<int>(type: "INTEGER", nullable: false),
                    sound_hash = table.Column<string>(type: "TEXT", nullable: false),
                    created_at = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_favorites", x => new { x.user_id, x.sound_hash });
                    table.ForeignKey(
                        name: "FK_user_favorites_sounds_sound_hash",
                        column: x => x.sound_hash,
                        principalTable: "sounds",
                        principalColumn: "hash",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_user_favorites_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_user_favorites_sound_hash",
                table: "user_favorites",
                column: "sound_hash");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "user_favorites");
        }
    }
}
