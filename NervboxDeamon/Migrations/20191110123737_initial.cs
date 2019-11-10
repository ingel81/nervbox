using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

namespace NervboxDeamon.Migrations
{
    public partial class initial : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "settings",
                columns: table => new
                {
                    Key = table.Column<string>(nullable: false),
                    Description = table.Column<string>(nullable: false),
                    SettingType = table.Column<string>(maxLength: 50, nullable: false),
                    SettingScope = table.Column<string>(maxLength: 50, nullable: false),
                    Value = table.Column<string>(nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_settings", x => x.Key);
                });

            migrationBuilder.CreateTable(
                name: "sound",
                columns: table => new
                {
                    hash = table.Column<string>(nullable: false),
                    fileName = table.Column<string>(nullable: true),
                    allowed = table.Column<bool>(nullable: false),
                    valid = table.Column<bool>(nullable: false),
                    Size = table.Column<long>(nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_sound", x => x.hash);
                });

            migrationBuilder.CreateTable(
                name: "users",
                columns: table => new
                {
                    Id = table.Column<int>(nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.SerialColumn),
                    Email = table.Column<string>(nullable: true),
                    FirstName = table.Column<string>(nullable: true),
                    LastName = table.Column<string>(nullable: true),
                    Username = table.Column<string>(nullable: false),
                    Password = table.Column<string>(nullable: true),
                    Token = table.Column<string>(nullable: true),
                    Role = table.Column<string>(nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_users", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "soundusage",
                columns: table => new
                {
                    time = table.Column<DateTime>(nullable: false),
                    soundhash = table.Column<string>(nullable: true),
                    initiator = table.Column<string>(nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_soundusage", x => x.time);
                    table.ForeignKey(
                        name: "FK_soundusage_sound_soundhash",
                        column: x => x.soundhash,
                        principalTable: "sound",
                        principalColumn: "hash",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_soundusage_soundhash",
                table: "soundusage",
                column: "soundhash");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "settings");

            migrationBuilder.DropTable(
                name: "soundusage");

            migrationBuilder.DropTable(
                name: "users");

            migrationBuilder.DropTable(
                name: "sound");
        }
    }
}
