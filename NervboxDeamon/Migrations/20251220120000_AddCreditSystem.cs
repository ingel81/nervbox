using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NervboxDeamon.Migrations
{
    /// <inheritdoc />
    public partial class AddCreditSystem : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Add credits and last_credit_grant_at to users table
            migrationBuilder.AddColumn<int>(
                name: "credits",
                table: "users",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "last_credit_grant_at",
                table: "users",
                type: "TEXT",
                nullable: true);

            // Create credit_settings table
            migrationBuilder.CreateTable(
                name: "credit_settings",
                columns: table => new
                {
                    id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    initial_credits_user = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 50),
                    initial_credits_admin = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 999999999),
                    cost_per_sound_play = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 1),
                    hourly_credits_enabled = table.Column<bool>(type: "INTEGER", nullable: false, defaultValue: true),
                    hourly_credits_amount = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 5),
                    max_credits_user = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 500),
                    min_credits_to_play = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 1)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_credit_settings", x => x.id);
                });

            // Create credit_transactions table
            migrationBuilder.CreateTable(
                name: "credit_transactions",
                columns: table => new
                {
                    id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    user_id = table.Column<int>(type: "INTEGER", nullable: false),
                    amount = table.Column<int>(type: "INTEGER", nullable: false),
                    transaction_type = table.Column<string>(type: "TEXT", nullable: false),
                    description = table.Column<string>(type: "TEXT", nullable: true),
                    balance_after = table.Column<int>(type: "INTEGER", nullable: false),
                    created_at = table.Column<DateTime>(type: "TEXT", nullable: false),
                    related_entity_id = table.Column<string>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_credit_transactions", x => x.id);
                    table.ForeignKey(
                        name: "FK_credit_transactions_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_credit_transactions_user_id",
                table: "credit_transactions",
                column: "user_id");

            // Insert default credit settings
            migrationBuilder.Sql(@"
                INSERT INTO credit_settings (
                    initial_credits_user,
                    initial_credits_admin,
                    cost_per_sound_play,
                    hourly_credits_enabled,
                    hourly_credits_amount,
                    max_credits_user,
                    min_credits_to_play
                ) VALUES (50, 999999999, 1, 1, 5, 500, 1)
            ");

            // Give existing admins lots of credits, regular users some initial credits
            migrationBuilder.Sql("UPDATE users SET credits = 999999999 WHERE role = 'admin'");
            migrationBuilder.Sql("UPDATE users SET credits = 50 WHERE role != 'admin'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "credit_transactions");

            migrationBuilder.DropTable(
                name: "credit_settings");

            migrationBuilder.DropColumn(
                name: "credits",
                table: "users");

            migrationBuilder.DropColumn(
                name: "last_credit_grant_at",
                table: "users");
        }
    }
}
