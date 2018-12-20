using System;
using Microsoft.EntityFrameworkCore.Migrations;

namespace NervboxDeamon.Migrations
{
    public partial class Initial : Migration
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
                name: "Sounds",
                columns: table => new
                {
                    hash = table.Column<string>(nullable: false),
                    fileName = table.Column<string>(nullable: true),
                    allowed = table.Column<bool>(nullable: false),
                    valid = table.Column<bool>(nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Sounds", x => x.hash);
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
                        name: "FK_soundusage_Sounds_soundhash",
                        column: x => x.soundhash,
                        principalTable: "Sounds",
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
                name: "Sounds");
        }
    }
}
