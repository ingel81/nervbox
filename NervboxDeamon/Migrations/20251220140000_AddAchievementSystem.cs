using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NervboxDeamon.Migrations
{
    /// <inheritdoc />
    public partial class AddAchievementSystem : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Create achievements table
            migrationBuilder.CreateTable(
                name: "achievements",
                columns: table => new
                {
                    id = table.Column<string>(type: "TEXT", nullable: false),
                    name = table.Column<string>(type: "TEXT", nullable: false),
                    description = table.Column<string>(type: "TEXT", nullable: false),
                    icon = table.Column<string>(type: "TEXT", nullable: true),
                    category = table.Column<string>(type: "TEXT", nullable: false),
                    tier = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 0),
                    threshold = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 0),
                    sort_order = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 0),
                    is_active = table.Column<bool>(type: "INTEGER", nullable: false, defaultValue: true),
                    reward_credits = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 0)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_achievements", x => x.id);
                });

            // Create user_achievements table
            migrationBuilder.CreateTable(
                name: "user_achievements",
                columns: table => new
                {
                    user_id = table.Column<int>(type: "INTEGER", nullable: false),
                    achievement_id = table.Column<string>(type: "TEXT", nullable: false),
                    earned_at = table.Column<DateTime>(type: "TEXT", nullable: false),
                    progress_value = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 0)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_achievements", x => new { x.user_id, x.achievement_id });
                    table.ForeignKey(
                        name: "FK_user_achievements_achievements_achievement_id",
                        column: x => x.achievement_id,
                        principalTable: "achievements",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_user_achievements_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_user_achievements_achievement_id",
                table: "user_achievements",
                column: "achievement_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "user_achievements");

            migrationBuilder.DropTable(
                name: "achievements");
        }
    }
}
